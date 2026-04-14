package reporter

import (
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/huha/probe-go/internal/config"
	"github.com/huha/probe-go/internal/protocol"
)

type Reporter struct {
	cfg config.Config
	mu  sync.Mutex
	ws  *websocket.Conn
	seq int64
}

func New(cfg config.Config) *Reporter {
	return &Reporter{cfg: cfg}
}

func (r *Reporter) Connect() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	conn, _, err := websocket.DefaultDialer.Dial(r.cfg.ServerURL, nil)
	if err != nil {
		return err
	}

	r.ws = conn
	return nil
}

func (r *Reporter) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.ws == nil {
		return nil
	}

	err := r.ws.Close()
	r.ws = nil
	return err
}

func (r *Reporter) Send(messageType string, payload interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.ws == nil {
		return errors.New("websocket not connected")
	}

	r.seq++
	envelope := protocol.Envelope{
		Type:     messageType,
		AgentID:  r.cfg.AgentID,
		TS:       time.Now().UnixMilli(),
		Seq:      r.seq,
		Platform: currentPlatform(),
		Version:  r.cfg.Version,
		Payload:  payload,
	}

	body, err := json.Marshal(envelope)
	if err != nil {
		return err
	}

	return r.ws.WriteMessage(websocket.TextMessage, body)
}

func currentPlatform() string {
	return runtimePlatform
}
