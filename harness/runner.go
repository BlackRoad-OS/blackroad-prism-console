package harness

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// EvaluateRuleForEvent normalises and evaluates a single event against the
// compiled rule. The event is appended to the backing window store (if
// configured) before evaluation to ensure CEL rate() calls observe the updated
// window contents.
func EvaluateRuleForEvent(rule CompiledRule, event Event) (RuleDecision, error) {
	return evaluateWithTimestamp(rule, event, time.Now().UTC())
}

// EvaluateRuleForSeries evaluates a batch of events against the rule in
// chronological order. Events are distributed across the provided window when
// no explicit timestamp is present so relative ordering is preserved for the
// rate() helper.
func EvaluateRuleForSeries(rule CompiledRule, series []Event, window time.Duration) (RuleDecision, error) {
	if len(series) == 0 {
		return RuleDecision{}, fmt.Errorf("series must contain at least one event")
	}
	if window <= 0 {
		return RuleDecision{}, fmt.Errorf("window must be positive")
	}

	now := time.Now().UTC()
	step := window / time.Duration(len(series)+1)
	if step <= 0 {
		step = time.Second
	}

	var dec RuleDecision
	var err error
	for i, ev := range series {
		fallback := now.Add(-window).Add(time.Duration(i+1) * step)
		dec, err = evaluateWithTimestamp(rule, ev, fallback)
		if err != nil {
			return RuleDecision{}, err
		}
	}
	return dec, nil
}

func evaluateWithTimestamp(rule CompiledRule, event Event, fallback time.Time) (RuleDecision, error) {
	ev := NormalizeEvent(event)
	ts := extractTimestamp(ev, fallback)
	ev["ts"] = ts

	if rule.Store != nil {
		rule.Store.Append(ts, ev)
	}

	return EvaluateEvent(rule, ev)
}

func extractTimestamp(ev Event, fallback time.Time) time.Time {
	raw, ok := ev["ts"]
	if !ok {
		return fallback
	}

	switch v := raw.(type) {
	case time.Time:
		return v
	case string:
		if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
			return t
		}
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t
		}
	case json.Number:
		if secs, err := v.Float64(); err == nil {
			return fallbackFromSeconds(secs)
		}
	case float64:
		return fallbackFromSeconds(v)
	case int64:
		return time.Unix(v, 0).UTC()
	case int:
		return time.Unix(int64(v), 0).UTC()
	}

	return fallback
}

func fallbackFromSeconds(secs float64) time.Time {
	return time.Unix(0, int64(secs*float64(time.Second))).UTC()
}

func EnforceDecision(dec RuleDecision) error {
	switch dec.Decision {
	case "deny":
		return fmt.Errorf("policy_violation: %s (%s)", dec.Reason, dec.RuleID)
	case "notify":
		_ = EmitComplianceNotification(dec)
	}
	return nil
}

func EmitComplianceNotification(dec RuleDecision) error {
	payload := map[string]any{
		"text":     fmt.Sprintf(":rotating_light: %s — %s", dec.Details["message"], dec.Reason),
		"metadata": map[string]any{"rule_id": dec.RuleID, "reason": dec.Reason},
	}
	return PostSlackMessage("#secops", payload)
}

// PostSlackMessage posts a JSON payload to the Slack incoming webhook
// configured via the SLACK_WEBHOOK_URL environment variable. When the variable
// is unset the function is a silent no-op for backward compatibility.
func PostSlackMessage(channel string, payload map[string]any) error {
	webhookURL := os.Getenv("SLACK_WEBHOOK_URL")
	if webhookURL == "" {
		return nil
	}

	body := map[string]any{
		"channel": channel,
	}
	for k, v := range payload {
		body[k] = v
	}

	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("PostSlackMessage: marshal payload: %w", err)
	}

	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("PostSlackMessage: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("PostSlackMessage: unexpected status %d", resp.StatusCode)
	}

	return nil
}
