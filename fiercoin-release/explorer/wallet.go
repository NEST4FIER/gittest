// Web wallet + web miner support for the FierCoin Explorer.
//
// These endpoints let a browser wallet (for example on an iPhone) work without
// running its own node. The browser keeps its own keys and signs its own
// payments; the server never sees a private key. It only:
//   - lists an address's unspent coins       GET  /api/utxos/<address>
//   - passes a signed payment to the network  POST /api/broadcast  {"hex": "..."}
//   - hands out mining work                   GET  /api/work?addr=<address>
//   - passes a solved block to the network    POST /api/submit    {"id": "...", "nonce": 123}
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const coinbaseMaturity = 100

func (s *server) addWalletAPI(mux *http.ServeMux) {
	w := &walletAPI{s: s, work: map[string]*workItem{}}
	mux.HandleFunc("/api/utxos/", w.utxos)
	mux.HandleFunc("/api/broadcast", w.broadcast)
	mux.HandleFunc("/api/work", w.getWork)
	mux.HandleFunc("/api/submit", w.submit)
}

type walletAPI struct {
	s *server

	memMu   sync.Mutex
	memAt   time.Time
	memTxs  []memTx
	memSpnt map[string]string // "txid:n" -> spending mempool txid

	workMu sync.Mutex
	work   map[string]*workItem
	order  []string
}

type memTx struct {
	Txid string
	Outs []memOut
}

type memOut struct {
	N     int
	Addr  string
	Value int64
}

// mempool returns unconfirmed payments (refreshed at most every 3 seconds).
func (w *walletAPI) mempool() ([]memTx, map[string]string) {
	w.memMu.Lock()
	defer w.memMu.Unlock()
	if time.Since(w.memAt) < 3*time.Second && w.memSpnt != nil {
		return w.memTxs, w.memSpnt
	}
	var ids []string
	if err := w.s.rpc.into(&ids, "getrawmempool"); err != nil {
		return w.memTxs, w.memSpnt
	}
	txs := []memTx{}
	spent := map[string]string{}
	for i, id := range ids {
		if i >= 2000 {
			break
		}
		var t tx
		if err := w.s.rpc.into(&t, "getrawtransaction", id, true); err != nil {
			continue
		}
		m := memTx{Txid: t.Txid}
		for _, in := range t.Vin {
			if in.Coinbase == "" {
				spent[in.Txid+":"+strconv.Itoa(in.Vout)] = t.Txid
			}
		}
		for _, o := range t.Vout {
			m.Outs = append(m.Outs, memOut{N: o.N, Addr: o.SPK.addr(), Value: sats(o.Value)})
		}
		txs = append(txs, m)
	}
	w.memTxs, w.memSpnt, w.memAt = txs, spent, time.Now()
	return txs, spent
}

type utxo struct {
	Txid     string `json:"txid"`
	Vout     int    `json:"vout"`
	Value    int64  `json:"value"`  // in satoshis (1 FIRC = 100,000,000)
	Height   int    `json:"height"` // 0 = not confirmed yet
	Coinbase bool   `json:"coinbase"`
	Mature   bool   `json:"mature"` // false = freshly mined, can't be spent yet
}

func (w *walletAPI) utxos(rw http.ResponseWriter, r *http.Request) {
	a := strings.TrimPrefix(r.URL.Path, "/api/utxos/")
	if !reAddr.MatchString(a) {
		writeErr(rw, 400, "Not a FierCoin address.")
		return
	}
	memTxs, memSpent := w.mempool()
	out := []utxo{}
	pending := []string{}
	w.s.ix.mu.RLock()
	tip := len(w.s.ix.blocks) - 1
	if info := w.s.ix.addrs[a]; info != nil {
		for _, key := range info.Outs {
			o := w.s.ix.outs[key]
			if o == nil || o.Spent != "" {
				continue
			}
			if by, ok := memSpent[key]; ok {
				pending = append(pending, by)
				continue
			}
			i := strings.LastIndexByte(key, ':')
			n, _ := strconv.Atoi(key[i+1:])
			mature := !o.Coinbase || tip-o.Height+1 >= coinbaseMaturity
			out = append(out, utxo{Txid: key[:i], Vout: n, Value: o.Value, Height: o.Height, Coinbase: o.Coinbase, Mature: mature})
		}
	}
	w.s.ix.mu.RUnlock()
	for _, m := range memTxs {
		for _, o := range m.Outs {
			if o.Addr != a {
				continue
			}
			pending = append(pending, m.Txid)
			if _, spent := memSpent[m.Txid+":"+strconv.Itoa(o.N)]; !spent {
				out = append(out, utxo{Txid: m.Txid, Vout: o.N, Value: o.Value, Mature: true})
			}
		}
	}
	writeJSON(rw, map[string]interface{}{"address": a, "tip": tip, "utxos": out, "pending": uniq(pending)})
}

func uniq(xs []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, x := range xs {
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}

func readJSONBody(r *http.Request, v interface{}) error {
	return json.NewDecoder(io.LimitReader(r.Body, 200000)).Decode(v)
}

func (w *walletAPI) broadcast(rw http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeErr(rw, 405, "Use POST.")
		return
	}
	var req struct {
		Hex string `json:"hex"`
	}
	if err := readJSONBody(r, &req); err != nil || req.Hex == "" {
		writeErr(rw, 400, "Missing payment data.")
		return
	}
	if _, err := hex.DecodeString(req.Hex); err != nil {
		writeErr(rw, 400, "Payment data is not valid.")
		return
	}
	var txid string
	if err := w.s.rpc.into(&txid, "sendrawtransaction", req.Hex); err != nil {
		writeErr(rw, 400, "The network refused this payment: "+err.Error())
		return
	}
	w.memMu.Lock()
	w.memAt = time.Time{} // refresh the unconfirmed list on the next request
	w.memMu.Unlock()
	log.Printf("Web wallet sent payment %s", txid)
	writeJSON(rw, map[string]string{"txid": txid})
}

// ---------- web mining ----------

type workItem struct {
	header   []byte // 80 bytes, nonce = 0
	coinbase []byte
	height   int
	prev     string
	created  time.Time
}

func dsha(b []byte) []byte {
	h := sha256.Sum256(b)
	h = sha256.Sum256(h[:])
	return h[:]
}

func reverse(b []byte) []byte {
	out := make([]byte, len(b))
	for i := range b {
		out[i] = b[len(b)-1-i]
	}
	return out
}

func varint(n int) []byte {
	switch {
	case n < 0xfd:
		return []byte{byte(n)}
	case n <= 0xffff:
		return []byte{0xfd, byte(n), byte(n >> 8)}
	default:
		b := make([]byte, 5)
		b[0] = 0xfe
		binary.LittleEndian.PutUint32(b[1:], uint32(n))
		return b
	}
}

// scriptNum pushes a number the way the node's "CScript() << n" does (needed for the block height, BIP34).
func scriptNum(n int64) []byte {
	if n == 0 {
		return []byte{0x00}
	}
	if n >= 1 && n <= 16 {
		return []byte{byte(0x50 + n)}
	}
	var v []byte
	for x := n; x > 0; x >>= 8 {
		v = append(v, byte(x&0xff))
	}
	if v[len(v)-1]&0x80 != 0 {
		v = append(v, 0x00)
	}
	return append([]byte{byte(len(v))}, v...)
}

func (w *walletAPI) getWork(rw http.ResponseWriter, r *http.Request) {
	a := r.URL.Query().Get("addr")
	if !reAddr.MatchString(a) {
		writeErr(rw, 400, "Not a FierCoin address.")
		return
	}
	var v struct {
		IsValid bool   `json:"isvalid"`
		Script  string `json:"scriptPubKey"`
	}
	if err := w.s.rpc.into(&v, "validateaddress", a); err != nil || !v.IsValid {
		writeErr(rw, 400, "That is not a FierCoin address.")
		return
	}
	spk, _ := hex.DecodeString(v.Script)
	var t struct {
		Version int64  `json:"version"`
		Prev    string `json:"previousblockhash"`
		Value   int64  `json:"coinbasevalue"`
		Target  string `json:"target"`
		CurTime int64  `json:"curtime"`
		Bits    string `json:"bits"`
		Height  int64  `json:"height"`
		Txs     []struct {
			Fee int64 `json:"fee"`
		} `json:"transactions"`
	}
	if err := w.s.rpc.into(&t, "getblocktemplate", map[string]interface{}{"rules": []string{"mweb", "segwit"}}); err != nil {
		writeErr(rw, 503, "Mining is not available right now: "+err.Error())
		return
	}
	// This block holds only the miner's reward, so leave out the other payments' fees.
	reward := t.Value
	for _, x := range t.Txs {
		reward -= x.Fee
	}
	extra := make([]byte, 8)
	rand.Read(extra)
	sig := append(scriptNum(t.Height), 0x08)
	sig = append(sig, extra...)
	sig = append(sig, []byte("/FierCoin web/")...)

	var cb []byte
	cb = append(cb, 1, 0, 0, 0)             // version
	cb = append(cb, 1)                      // 1 input
	cb = append(cb, make([]byte, 32)...)    // no previous coin
	cb = append(cb, 0xff, 0xff, 0xff, 0xff) // index
	cb = append(cb, varint(len(sig))...)
	cb = append(cb, sig...)
	cb = append(cb, 0xff, 0xff, 0xff, 0xff) // sequence
	cb = append(cb, 1)                      // 1 output
	val := make([]byte, 8)
	binary.LittleEndian.PutUint64(val, uint64(reward))
	cb = append(cb, val...)
	cb = append(cb, varint(len(spk))...)
	cb = append(cb, spk...)
	cb = append(cb, 0, 0, 0, 0) // lock time

	prev, _ := hex.DecodeString(t.Prev)
	bits, _ := hex.DecodeString(t.Bits)
	hdr := make([]byte, 0, 80)
	b4 := make([]byte, 4)
	binary.LittleEndian.PutUint32(b4, uint32(t.Version))
	hdr = append(hdr, b4...)
	hdr = append(hdr, reverse(prev)...)
	hdr = append(hdr, dsha(cb)...) // merkle root = the only transaction's id
	binary.LittleEndian.PutUint32(b4, uint32(t.CurTime))
	hdr = append(hdr, b4...)
	hdr = append(hdr, reverse(bits)...)
	hdr = append(hdr, 0, 0, 0, 0)

	idb := make([]byte, 8)
	rand.Read(idb)
	id := hex.EncodeToString(idb)
	w.workMu.Lock()
	w.work[id] = &workItem{header: hdr, coinbase: cb, height: int(t.Height), prev: t.Prev, created: time.Now()}
	w.order = append(w.order, id)
	for len(w.order) > 5000 {
		delete(w.work, w.order[0])
		w.order = w.order[1:]
	}
	w.workMu.Unlock()
	writeJSON(rw, map[string]interface{}{
		"id": id, "header": hex.EncodeToString(hdr), "target": t.Target,
		"height": t.Height, "reward": float64(reward) / 1e8, "prev": t.Prev,
	})
}

func (w *walletAPI) submit(rw http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeErr(rw, 405, "Use POST.")
		return
	}
	var req struct {
		ID    string `json:"id"`
		Nonce uint32 `json:"nonce"`
	}
	if err := readJSONBody(r, &req); err != nil {
		writeErr(rw, 400, "Bad request.")
		return
	}
	w.workMu.Lock()
	it := w.work[req.ID]
	w.workMu.Unlock()
	if it == nil {
		writeErr(rw, 410, "That mining job expired. Getting a new one.")
		return
	}
	hdr := append([]byte{}, it.header...)
	binary.LittleEndian.PutUint32(hdr[76:], req.Nonce)
	blk := append(hdr, varint(1)...)
	blk = append(blk, it.coinbase...)
	var res interface{}
	if err := w.s.rpc.into(&res, "submitblock", hex.EncodeToString(blk)); err != nil {
		writeErr(rw, 400, "The network refused the block: "+err.Error())
		return
	}
	if res != nil {
		writeJSON(rw, map[string]interface{}{"accepted": false, "reason": res})
		return
	}
	log.Printf("Web miner found block %d", it.height)
	writeJSON(rw, map[string]interface{}{"accepted": true, "height": it.height})
}
