// FierCoin Explorer: a small block explorer website that reads from a local FierCoin node.
// It only uses read-only node commands and never touches the wallet.
package main

import (
	"bufio"
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFiles embed.FS

// ---------- node RPC ----------

type rpcClient struct {
	url        string
	user, pass string
	http       *http.Client
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string { return e.Message }

func (c *rpcClient) call(method string, params ...interface{}) (json.RawMessage, error) {
	if params == nil {
		params = []interface{}{}
	}
	body, _ := json.Marshal(map[string]interface{}{"jsonrpc": "1.0", "id": "explorer", "method": method, "params": params})
	req, _ := http.NewRequest("POST", c.url, bytes.NewReader(body))
	req.SetBasicAuth(c.user, c.pass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return nil, errors.New("the FierCoin wallet refused the password (restart FierCoin, then this program)")
	}
	var out struct {
		Result json.RawMessage `json:"result"`
		Error  *rpcError       `json:"error"`
	}
	dec := json.NewDecoder(resp.Body)
	dec.UseNumber()
	if err := dec.Decode(&out); err != nil {
		return nil, fmt.Errorf("bad reply from node (HTTP %d)", resp.StatusCode)
	}
	if out.Error != nil {
		return nil, out.Error
	}
	return out.Result, nil
}

func (c *rpcClient) into(v interface{}, method string, params ...interface{}) error {
	raw, err := c.call(method, params...)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	return dec.Decode(v)
}

// ---------- block data ----------

type scriptPubKey struct {
	Type      string   `json:"type"`
	Address   string   `json:"address"`
	Addresses []string `json:"addresses"`
}

func (s scriptPubKey) addr() string {
	if s.Address != "" {
		return s.Address
	}
	if len(s.Addresses) > 0 {
		return s.Addresses[0]
	}
	if s.Type == "nulldata" {
		return "(data)"
	}
	return "(" + s.Type + ")"
}

type vout struct {
	Value json.Number  `json:"value"`
	N     int          `json:"n"`
	SPK   scriptPubKey `json:"scriptPubKey"`
}

type vin struct {
	Coinbase string `json:"coinbase"`
	Txid     string `json:"txid"`
	Vout     int    `json:"vout"`
}

type tx struct {
	Txid string `json:"txid"`
	Vin  []vin  `json:"vin"`
	Vout []vout `json:"vout"`
}

type block struct {
	Hash         string      `json:"hash"`
	Height       int         `json:"height"`
	Time         int64       `json:"time"`
	Size         int         `json:"size"`
	NTx          int         `json:"nTx"`
	Difficulty   json.Number `json:"difficulty"`
	Previous     string      `json:"previousblockhash"`
	Tx           []tx        `json:"tx"`
}

func sats(n json.Number) int64 {
	f, _ := n.Float64()
	return int64(math.Round(f * 1e8))
}

// ---------- in-memory index (addresses, balances, block list) ----------

type outRef struct {
	Addr  string
	Value int64
	Spent string // txid that spent it
}

type txRef struct {
	Txid   string `json:"txid"`
	Height int    `json:"height"`
	Time   int64  `json:"time"`
	Delta  int64  `json:"delta"`
}

type addrInfo struct {
	Received int64
	Sent     int64
	Txs      []txRef
}

type blockSum struct {
	Height int    `json:"height"`
	Hash   string `json:"hash"`
	Time   int64  `json:"time"`
	NTx    int    `json:"ntx"`
	Size   int    `json:"size"`
	Miner  string `json:"miner"`
	Reward int64  `json:"reward"`
}

type index struct {
	mu      sync.RWMutex
	blocks  []blockSum
	outs    map[string]*outRef
	addrs   map[string]*addrInfo
	supply  int64
	lastErr string
}

func newIndex() *index {
	return &index{outs: map[string]*outRef{}, addrs: map[string]*addrInfo{}}
}

func (ix *index) addBlock(b *block) {
	sum := blockSum{Height: b.Height, Hash: b.Hash, Time: b.Time, NTx: b.NTx, Size: b.Size}
	for ti, t := range b.Tx {
		deltas := map[string]int64{}
		order := []string{}
		touch := func(a string, d int64) {
			if _, ok := deltas[a]; !ok {
				order = append(order, a)
			}
			deltas[a] += d
		}
		for _, in := range t.Vin {
			if in.Coinbase != "" {
				continue
			}
			key := in.Txid + ":" + strconv.Itoa(in.Vout)
			if o, ok := ix.outs[key]; ok {
				o.Spent = t.Txid
				touch(o.Addr, -o.Value)
			}
		}
		for _, o := range t.Vout {
			v := sats(o.Value)
			a := o.SPK.addr()
			ix.outs[t.Txid+":"+strconv.Itoa(o.N)] = &outRef{Addr: a, Value: v}
			touch(a, v)
			if ti == 0 {
				sum.Reward += v
				if sum.Miner == "" && v > 0 {
					sum.Miner = a
				}
			}
		}
		for _, a := range order {
			info := ix.addrs[a]
			if info == nil {
				info = &addrInfo{}
				ix.addrs[a] = info
			}
			d := deltas[a]
			if d >= 0 {
				info.Received += d
			} else {
				info.Sent += -d
			}
			info.Txs = append(info.Txs, txRef{Txid: t.Txid, Height: b.Height, Time: b.Time, Delta: d})
		}
	}
	// New coins = block subsidy only (fees are existing coins changing hands).
	// 50 FIRC, halving every 840,000 blocks - the same schedule as Litecoin.
	if halvings := b.Height / 840000; halvings < 64 {
		ix.supply += (50 * 100000000) >> uint(halvings)
	}
	ix.blocks = append(ix.blocks, sum)
}

// sync brings the index up to the node's tip. On a reorg it rebuilds from scratch (the chain is small).
func (ix *index) sync(c *rpcClient) error {
	var tip int
	if err := c.into(&tip, "getblockcount"); err != nil {
		return err
	}
	ix.mu.RLock()
	n := len(ix.blocks)
	reorg := false
	for h := n - 1; h >= 0 && h >= n-6; h-- {
		var hash string
		if err := c.into(&hash, "getblockhash", h); err != nil || hash != ix.blocks[h].Hash {
			reorg = true
			break
		}
	}
	ix.mu.RUnlock()
	if reorg || tip < n-1 {
		log.Printf("Blockchain changed (reorg) - rebuilding index")
		fresh := newIndex()
		ix.mu.Lock()
		ix.blocks, ix.outs, ix.addrs, ix.supply = fresh.blocks, fresh.outs, fresh.addrs, 0
		ix.mu.Unlock()
		n = 0
	}
	for h := n; h <= tip; h++ {
		var hash string
		if err := c.into(&hash, "getblockhash", h); err != nil {
			return err
		}
		var b block
		if err := c.into(&b, "getblock", hash, 2); err != nil {
			return err
		}
		ix.mu.Lock()
		ix.addBlock(&b)
		ix.mu.Unlock()
		if h%500 == 0 && h > 0 {
			log.Printf("Indexed block %d of %d", h, tip)
		}
	}
	return nil
}

// ---------- config ----------

func defaultDataDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("APPDATA"), "FierCoin")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "FierCoin")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".fiercoin")
	}
}

func readConf(path string) map[string]string {
	m := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return m
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "[") {
			continue
		}
		if i := strings.Index(line, "="); i > 0 {
			m[strings.TrimSpace(line[:i])] = strings.TrimSpace(line[i+1:])
		}
	}
	return m
}

// ensureConf makes sure the wallet's config lets this program read the blockchain.
// Returns true if it changed the file (FierCoin must then be restarted).
func ensureConf(path string) (bool, error) {
	conf := readConf(path)
	var add []string
	if conf["server"] != "1" {
		add = append(add, "server=1")
	}
	if conf["txindex"] != "1" {
		add = append(add, "txindex=1")
	}
	if len(add) == 0 {
		return false, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return false, err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return false, err
	}
	defer f.Close()
	nl := "\r\n"
	if runtime.GOOS != "windows" {
		nl = "\n"
	}
	text := nl + "# Added by FierCoin Explorer (lets the explorer read the blockchain)" + nl + strings.Join(add, nl) + nl
	_, err = f.WriteString(text)
	return true, err
}

func credentials(datadir, netdir string, conf map[string]string) (string, string, error) {
	if conf["rpcuser"] != "" && conf["rpcpassword"] != "" {
		return conf["rpcuser"], conf["rpcpassword"], nil
	}
	b, err := os.ReadFile(filepath.Join(datadir, netdir, ".cookie"))
	if err != nil {
		return "", "", errors.New("could not find FierCoin's login cookie - is the FierCoin wallet open?")
	}
	parts := strings.SplitN(strings.TrimSpace(string(b)), ":", 2)
	if len(parts) != 2 {
		return "", "", errors.New("FierCoin's login cookie looks wrong - restart FierCoin")
	}
	return parts[0], parts[1], nil
}

func localIPs() []string {
	var out []string
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if ipn, ok := a.(*net.IPNet); ok && !ipn.IP.IsLoopback() && ipn.IP.To4() != nil {
			out = append(out, ipn.IP.String())
		}
	}
	return out
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		exec.Command("open", url).Start()
	default:
		exec.Command("xdg-open", url).Start()
	}
}

func pause() {
	if runtime.GOOS == "windows" {
		fmt.Println("\nPress Enter to close this window.")
		bufio.NewReader(os.Stdin).ReadString('\n')
	}
}

// ---------- web server ----------

var (
	reHex64  = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
	reNumber = regexp.MustCompile(`^[0-9]{1,9}$`)
	reAddr   = regexp.MustCompile(`^[0-9A-Za-z]{20,100}$`)
)

type server struct {
	rpc *rpcClient
	ix  *index
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *server) status(w http.ResponseWriter, r *http.Request) {
	var info map[string]interface{}
	if err := s.rpc.into(&info, "getblockchaininfo"); err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	var peers interface{}
	s.rpc.into(&peers, "getconnectioncount")
	var hashps interface{}
	s.rpc.into(&hashps, "getnetworkhashps", 120)
	var mempool map[string]interface{}
	s.rpc.into(&mempool, "getmempoolinfo")
	s.ix.mu.RLock()
	supply, indexed := s.ix.supply, len(s.ix.blocks)
	s.ix.mu.RUnlock()
	writeJSON(w, map[string]interface{}{
		"blocks": info["blocks"], "difficulty": info["difficulty"], "chain": info["chain"],
		"peers": peers, "hashps": hashps, "mempool": mempool["size"],
		"supply": float64(supply) / 1e8, "maxsupply": 84000000, "indexed": indexed - 1,
	})
}

func (s *server) blocks(w http.ResponseWriter, r *http.Request) {
	s.ix.mu.RLock()
	defer s.ix.mu.RUnlock()
	n := len(s.ix.blocks)
	start, err := strconv.Atoi(r.URL.Query().Get("start"))
	if err != nil || start >= n || start < 0 {
		start = n - 1
	}
	out := []blockSum{}
	for h := start; h >= 0 && len(out) < 20; h-- {
		out = append(out, s.ix.blocks[h])
	}
	writeJSON(w, out)
}

func (s *server) block(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/block/")
	hash := id
	if reNumber.MatchString(id) {
		h, _ := strconv.Atoi(id)
		if err := s.rpc.into(&hash, "getblockhash", h); err != nil {
			writeErr(w, 404, "No block with that number yet.")
			return
		}
	} else if !reHex64.MatchString(id) {
		writeErr(w, 400, "Not a block number or hash.")
		return
	}
	raw, err := s.rpc.call("getblock", hash, 2)
	if err != nil {
		writeErr(w, 404, "Block not found.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(raw)
}

func (s *server) tx(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/tx/")
	if !reHex64.MatchString(id) {
		writeErr(w, 400, "Not a transaction ID.")
		return
	}
	var t map[string]interface{}
	if err := s.rpc.into(&t, "getrawtransaction", id, true); err != nil {
		writeErr(w, 404, "Transaction not found (it may still be indexing - try again in a minute).")
		return
	}
	// Add the address and amount of each input from our index.
	s.ix.mu.RLock()
	if vins, ok := t["vin"].([]interface{}); ok {
		for _, x := range vins {
			in, _ := x.(map[string]interface{})
			if in == nil || in["txid"] == nil {
				continue
			}
			n, _ := in["vout"].(json.Number).Int64()
			if o, ok := s.ix.outs[fmt.Sprintf("%v:%d", in["txid"], n)]; ok {
				in["prev_address"] = o.Addr
				in["prev_value"] = float64(o.Value) / 1e8
			}
		}
	}
	if vouts, ok := t["vout"].([]interface{}); ok {
		for _, x := range vouts {
			o, _ := x.(map[string]interface{})
			if o == nil {
				continue
			}
			n, _ := o["n"].(json.Number).Int64()
			if ref, ok := s.ix.outs[fmt.Sprintf("%s:%d", id, n)]; ok && ref.Spent != "" {
				o["spent_by"] = ref.Spent
			}
		}
	}
	s.ix.mu.RUnlock()
	writeJSON(w, t)
}

func (s *server) address(w http.ResponseWriter, r *http.Request) {
	a := strings.TrimPrefix(r.URL.Path, "/api/address/")
	if !reAddr.MatchString(a) {
		writeErr(w, 400, "Not a FierCoin address.")
		return
	}
	s.ix.mu.RLock()
	defer s.ix.mu.RUnlock()
	info := s.ix.addrs[a]
	if info == nil {
		var v map[string]interface{}
		if err := s.rpc.into(&v, "validateaddress", a); err != nil || v["isvalid"] != true {
			writeErr(w, 404, "That is not a FierCoin address.")
			return
		}
		writeJSON(w, map[string]interface{}{"address": a, "balance": 0, "received": 0, "sent": 0, "txcount": 0, "txs": []txRef{}})
		return
	}
	txs := make([]txRef, 0, 100)
	for i := len(info.Txs) - 1; i >= 0 && len(txs) < 100; i-- {
		txs = append(txs, info.Txs[i])
	}
	writeJSON(w, map[string]interface{}{
		"address": a, "balance": float64(info.Received-info.Sent) / 1e8,
		"received": float64(info.Received) / 1e8, "sent": float64(info.Sent) / 1e8,
		"txcount": len(info.Txs), "txs": txs,
	})
}

func (s *server) richlist(w http.ResponseWriter, r *http.Request) {
	s.ix.mu.RLock()
	type row struct {
		Address string  `json:"address"`
		Balance float64 `json:"balance"`
	}
	rows := []row{}
	for a, info := range s.ix.addrs {
		if b := info.Received - info.Sent; b > 0 && !strings.HasPrefix(a, "(") {
			rows = append(rows, row{a, float64(b) / 1e8})
		}
	}
	s.ix.mu.RUnlock()
	sort.Slice(rows, func(i, j int) bool { return rows[i].Balance > rows[j].Balance })
	if len(rows) > 50 {
		rows = rows[:50]
	}
	writeJSON(w, rows)
}

func (s *server) mempool(w http.ResponseWriter, r *http.Request) {
	raw, err := s.rpc.call("getrawmempool")
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(raw)
}

func (s *server) search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	switch {
	case reNumber.MatchString(q):
		writeJSON(w, map[string]string{"type": "block", "id": q})
	case reHex64.MatchString(q):
		if _, err := s.rpc.call("getblockheader", q); err == nil {
			writeJSON(w, map[string]string{"type": "block", "id": q})
		} else {
			writeJSON(w, map[string]string{"type": "tx", "id": q})
		}
	case reAddr.MatchString(q):
		writeJSON(w, map[string]string{"type": "address", "id": q})
	default:
		writeErr(w, 400, "Type a block number, a block hash, a transaction ID or an address.")
	}
}

func main() {
	datadir := flag.String("datadir", defaultDataDir(), "FierCoin data folder")
	listen := flag.String("listen", ":8080", "address and port for the explorer website")
	regtest := flag.Bool("regtest", false, "use the local test network (for developers)")
	noBrowser := flag.Bool("nobrowser", false, "don't open the web browser")
	flag.Parse()
	log.SetFlags(log.Ltime)

	fmt.Println("=========================================")
	fmt.Println("  FierCoin Explorer")
	fmt.Println("=========================================")

	confPath := filepath.Join(*datadir, "fiercoin.conf")
	netdir, port := "", 29332
	if *regtest {
		netdir, port = "regtest", 19443
	}
	if !*regtest {
		changed, err := ensureConf(confPath)
		if err != nil {
			fmt.Println("Could not update", confPath, ":", err)
			pause()
			return
		}
		if changed {
			fmt.Println("First-time setup done: I turned on blockchain reading in")
			fmt.Println("   ", confPath)
			fmt.Println()
			fmt.Println("Now: close the FierCoin wallet (File > Exit), open it again,")
			fmt.Println("wait until it finishes loading, then run FierCoin Explorer again.")
			pause()
			return
		}
	}
	conf := readConf(confPath)
	if p, err := strconv.Atoi(conf["rpcport"]); err == nil && !*regtest {
		port = p
	}
	rpc := &rpcClient{url: fmt.Sprintf("http://127.0.0.1:%d/", port), http: &http.Client{Timeout: 60 * time.Second}}
	for {
		user, pass, err := credentials(*datadir, netdir, conf)
		if err == nil {
			rpc.user, rpc.pass = user, pass
			if _, err = rpc.call("getblockcount"); err == nil {
				break
			}
		}
		fmt.Println("Waiting for the FierCoin wallet:", err)
		fmt.Println("(Make sure FierCoin is open. Trying again in 10 seconds...)")
		time.Sleep(10 * time.Second)
	}

	ix := newIndex()
	fmt.Println("Reading the blockchain...")
	if err := ix.sync(rpc); err != nil {
		fmt.Println("Problem reading the blockchain:", err)
	}
	go func() {
		for {
			time.Sleep(15 * time.Second)
			if err := ix.sync(rpc); err != nil {
				log.Println("Update problem:", err)
			}
		}
	}()

	s := &server{rpc: rpc, ix: ix}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", s.status)
	mux.HandleFunc("/api/blocks", s.blocks)
	mux.HandleFunc("/api/block/", s.block)
	mux.HandleFunc("/api/tx/", s.tx)
	mux.HandleFunc("/api/address/", s.address)
	mux.HandleFunc("/api/richlist", s.richlist)
	mux.HandleFunc("/api/mempool", s.mempool)
	mux.HandleFunc("/api/search", s.search)
	sub, _ := fs.Sub(webFiles, "web")
	mux.Handle("/", http.FileServer(http.FS(sub)))

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		fmt.Println("Could not start the website on", *listen, ":", err)
		fmt.Println("(Another program may be using that port. Try: FierCoin-Explorer.exe -listen :8090)")
		pause()
		return
	}
	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	url := "http://localhost:" + portStr
	fmt.Println()
	fmt.Println("Explorer is running! Open it in your browser:")
	fmt.Println("   On this PC:          ", url)
	for _, ip := range localIPs() {
		fmt.Printf("   On phones at home:    http://%s:%s\n", ip, portStr)
	}
	fmt.Println("   For people elsewhere: http://YOUR-PUBLIC-IP:" + portStr + "  (needs port forwarding)")
	fmt.Println()
	fmt.Println("Keep this window open. Close it to stop the explorer.")
	if !*noBrowser {
		openBrowser(url)
	}
	log.Fatal(http.Serve(ln, mux))
}
