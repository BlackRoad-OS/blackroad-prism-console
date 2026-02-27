package harness

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPostSlackMessage_Success(t *testing.T) {
	var received map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected application/json, got %s", ct)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	t.Setenv("SLACK_WEBHOOK_URL", srv.URL)

	err := PostSlackMessage("#secops", map[string]any{
		"text": "test alert",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received["channel"] != "#secops" {
		t.Errorf("expected channel #secops, got %v", received["channel"])
	}
	if received["text"] != "test alert" {
		t.Errorf("expected text 'test alert', got %v", received["text"])
	}
}

func TestPostSlackMessage_MissingWebhookURL(t *testing.T) {
	t.Setenv("SLACK_WEBHOOK_URL", "")

	err := PostSlackMessage("#general", map[string]any{"text": "hello"})
	if err == nil {
		t.Fatal("expected error when SLACK_WEBHOOK_URL is empty")
	}
}

func TestPostSlackMessage_NonOKStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	t.Setenv("SLACK_WEBHOOK_URL", srv.URL)

	err := PostSlackMessage("#secops", map[string]any{"text": "test"})
	if err == nil {
		t.Fatal("expected error on non-2xx status")
	}
}
