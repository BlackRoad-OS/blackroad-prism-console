package harness

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestPostSlackMessage_NoWebhookURL(t *testing.T) {
	os.Unsetenv("SLACK_WEBHOOK_URL")
	err := PostSlackMessage("#general", map[string]any{"text": "hello"})
	if err != nil {
		t.Fatalf("expected nil error when SLACK_WEBHOOK_URL is unset, got: %v", err)
	}
}

func TestPostSlackMessage_Success(t *testing.T) {
	var received map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &received); err != nil {
			t.Fatalf("failed to unmarshal request body: %v", err)
		}
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	old := os.Getenv("SLACK_WEBHOOK_URL")
	os.Setenv("SLACK_WEBHOOK_URL", srv.URL)
	defer os.Setenv("SLACK_WEBHOOK_URL", old)

	err := PostSlackMessage("#secops", map[string]any{
		"text": ":rotating_light: test alert",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received["channel"] != "#secops" {
		t.Errorf("expected channel #secops, got %v", received["channel"])
	}
	if received["text"] != ":rotating_light: test alert" {
		t.Errorf("expected text ':rotating_light: test alert', got %v", received["text"])
	}
}

func TestPostSlackMessage_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()

	old := os.Getenv("SLACK_WEBHOOK_URL")
	os.Setenv("SLACK_WEBHOOK_URL", srv.URL)
	defer os.Setenv("SLACK_WEBHOOK_URL", old)

	err := PostSlackMessage("#general", map[string]any{"text": "test"})
	if err == nil {
		t.Fatal("expected error for 500 response, got nil")
	}
}

func TestPostSlackMessage_InvalidURL(t *testing.T) {
	old := os.Getenv("SLACK_WEBHOOK_URL")
	os.Setenv("SLACK_WEBHOOK_URL", "http://127.0.0.1:0/nonexistent")
	defer os.Setenv("SLACK_WEBHOOK_URL", old)

	err := PostSlackMessage("#general", map[string]any{"text": "test"})
	if err == nil {
		t.Fatal("expected error for unreachable URL, got nil")
	}
}
