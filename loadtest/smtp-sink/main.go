// Command smtp-sink is the mail sink of the load test (spec 008 AC-008-01, ADR-0023).
// It accepts mail over SMTP, throws it away and counts it. Each message can be held for a fixed
// time before the reply, to stand in for a real mail service. Only the standard library is used.
//
//	SMTP on :1025, HTTP on :8025
//	GET  /stats  {"received", "unique", "duplicates", "first_at", "last_at"}
//	POST /reset  start counting again
//
// Settings: SINK_DELAY_MS (default 0), SINK_SMTP_ADDR (default :1025), SINK_HTTP_ADDR (default :8025).
package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

func main() {
	delay := time.Duration(envInt("SINK_DELAY_MS", 0)) * time.Millisecond
	counter := newCounter()

	ln, err := net.Listen("tcp", envOr("SINK_SMTP_ADDR", ":1025"))
	if err != nil {
		log.Fatalf("smtp listen: %v", err)
	}
	srv := &http.Server{Addr: envOr("SINK_HTTP_ADDR", ":8025"), Handler: counter.handler(), ReadHeaderTimeout: 5 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		_ = ln.Close()
		_ = srv.Shutdown(context.Background())
	}()
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http: %v", err)
		}
	}()
	log.Printf("smtp-sink: SMTP %s, HTTP %s, delay %s", ln.Addr(), srv.Addr, delay)
	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("accept: %v", err)
			continue
		}
		go serve(conn, delay, counter)
	}
}

// serve speaks just enough SMTP for notify-relay's client: EHLO/HELO, MAIL, RCPT, DATA, RSET, NOOP, QUIT.
// AUTH is accepted without checking, since nothing leaves this program.
func serve(conn net.Conn, delay time.Duration, c *counter) {
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Minute))
	r := bufio.NewReader(conn)
	w := bufio.NewWriter(conn)
	reply := func(lines ...string) bool {
		for _, l := range lines {
			if _, err := w.WriteString(l + "\r\n"); err != nil {
				return false
			}
		}
		return w.Flush() == nil
	}
	if !reply("220 smtp-sink ready") {
		return
	}
	var rcpts []string
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"):
			reply("250-smtp-sink", "250-PIPELINING", "250-8BITMIME", "250 AUTH PLAIN")
		case strings.HasPrefix(cmd, "HELO"):
			reply("250 smtp-sink")
		case strings.HasPrefix(cmd, "AUTH"):
			reply("235 accepted")
		case strings.HasPrefix(cmd, "MAIL FROM:"):
			rcpts = rcpts[:0]
			reply("250 ok")
		case strings.HasPrefix(cmd, "RCPT TO:"):
			rcpts = append(rcpts, address(strings.TrimSpace(line)[len("RCPT TO:"):]))
			reply("250 ok")
		case cmd == "DATA":
			if !reply("354 end with <CRLF>.<CRLF>") {
				return
			}
			if err := discardData(r); err != nil {
				return
			}
			if delay > 0 {
				time.Sleep(delay)
			}
			c.add(rcpts)
			rcpts = rcpts[:0]
			reply("250 ok: thrown away")
		case cmd == "RSET":
			rcpts = rcpts[:0]
			reply("250 ok")
		case cmd == "NOOP":
			reply("250 ok")
		case cmd == "QUIT":
			reply("221 bye")
			return
		default:
			reply("502 not implemented")
		}
	}
}

// discardData reads the message up to the line with a single dot.
func discardData(r *bufio.Reader) error {
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return err
		}
		if line == ".\r\n" || line == ".\n" {
			return nil
		}
	}
}

// address takes the address out of "<a@b>" (and parameters after it), in lower case.
func address(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '>'); i >= 0 {
		s = s[:i]
	}
	return strings.ToLower(strings.TrimPrefix(s, "<"))
}

// counter counts the messages per recipient, to find mail sent twice (AC-008-08). Recipients are kept
// as the first 8 bytes of their SHA-256, so 300,000 of them take a few MB instead of tens of MB.
type counter struct {
	mu       sync.Mutex
	received int
	seen     map[uint64]struct{}
	first    time.Time
	last     time.Time
}

func newCounter() *counter { return &counter{seen: map[uint64]struct{}{}} }

func key(address string) uint64 {
	sum := sha256.Sum256([]byte(address))
	return binary.BigEndian.Uint64(sum[:8])
}

func (c *counter) add(rcpts []string) {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, to := range rcpts {
		c.received++
		c.seen[key(to)] = struct{}{}
	}
	if c.first.IsZero() {
		c.first = now
	}
	c.last = now
}

type stats struct {
	Received   int        `json:"received"`
	Unique     int        `json:"unique"`
	Duplicates int        `json:"duplicates"`
	FirstAt    *time.Time `json:"first_at"`
	LastAt     *time.Time `json:"last_at"`
}

func (c *counter) snapshot() stats {
	c.mu.Lock()
	defer c.mu.Unlock()
	s := stats{Received: c.received, Unique: len(c.seen), Duplicates: c.received - len(c.seen)}
	if !c.first.IsZero() {
		first, last := c.first.UTC(), c.last.UTC()
		s.FirstAt, s.LastAt = &first, &last
	}
	return s
}

func (c *counter) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.received, c.seen, c.first, c.last = 0, map[uint64]struct{}{}, time.Time{}, time.Time{}
}

func (c *counter) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /stats", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(c.snapshot())
	})
	mux.HandleFunc("POST /reset", func(w http.ResponseWriter, _ *http.Request) {
		c.reset()
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	n, err := strconv.Atoi(os.Getenv(key))
	if err != nil || n < 0 {
		return fallback
	}
	return n
}
