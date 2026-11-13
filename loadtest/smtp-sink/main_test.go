package main

import (
	"encoding/json"
	"net"
	"net/http/httptest"
	"net/smtp"
	"testing"
	"time"
)

// startSink runs the SMTP side on a free port and returns its address and the counter.
func startSink(t *testing.T, delay time.Duration) (string, *counter) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	c := newCounter()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go serve(conn, delay, c)
		}
	}()
	return ln.Addr().String(), c
}

func send(t *testing.T, addr, to string) {
	t.Helper()
	msg := []byte("Subject: test\r\n\r\nbody\r\n.. a line starting with a dot\r\n")
	if err := smtp.SendMail(addr, nil, "from@team-ops.invalid", []string{to}, msg); err != nil {
		t.Fatalf("send to %s: %v", to, err)
	}
}

func TestAC_008_01_Sink(t *testing.T) {
	tests := []struct {
		name       string
		delay      time.Duration
		recipients []string
		want       stats
	}{
		{"AC-008-01 counts each mail it throws away", 0, []string{"a@loadtest.invalid", "b@loadtest.invalid", "c@loadtest.invalid"}, stats{Received: 3, Unique: 3}},
		{"AC-008-08 a second mail to the same address is counted as a duplicate", 0, []string{"a@loadtest.invalid", "A@loadtest.invalid", "b@loadtest.invalid"}, stats{Received: 3, Unique: 2, Duplicates: 1}},
		{"AC-008-01 waits the given time before answering", 60 * time.Millisecond, []string{"a@loadtest.invalid"}, stats{Received: 1, Unique: 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			addr, c := startSink(t, tt.delay)
			started := time.Now()
			for _, to := range tt.recipients {
				send(t, addr, to)
			}
			if elapsed := time.Since(started); elapsed < tt.delay*time.Duration(len(tt.recipients)) {
				t.Errorf("answered after %s, want at least %s", elapsed, tt.delay)
			}
			got := c.snapshot()
			if got.Received != tt.want.Received || got.Unique != tt.want.Unique || got.Duplicates != tt.want.Duplicates {
				t.Errorf("stats = %+v, want %+v", got, tt.want)
			}
			if got.FirstAt == nil || got.LastAt == nil || got.LastAt.Before(*got.FirstAt) {
				t.Errorf("first_at/last_at = %v/%v", got.FirstAt, got.LastAt)
			}
		})
	}
}

func TestAC_008_01_StatsOverHTTP(t *testing.T) {
	addr, c := startSink(t, 0)
	send(t, addr, "a@loadtest.invalid")
	srv := httptest.NewServer(c.handler())
	defer srv.Close()

	resp, err := srv.Client().Get(srv.URL + "/stats")
	if err != nil {
		t.Fatal(err)
	}
	var got stats
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if got.Received != 1 {
		t.Errorf("received = %d, want 1", got.Received)
	}

	resp, err = srv.Client().Post(srv.URL+"/reset", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if s := c.snapshot(); s.Received != 0 || s.FirstAt != nil {
		t.Errorf("after reset: %+v", s)
	}
}
