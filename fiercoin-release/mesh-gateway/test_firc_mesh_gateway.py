"""Tests for the FierCoin mesh gateway, using the shared examples in test-vectors.json.
No radio and no internet needed. Run: python -m unittest discover -s fiercoin-release/mesh-gateway
"""
import json
import os
import unittest

import firc_mesh_gateway as G

V = json.load(open(os.path.join(os.path.dirname(__file__), "test-vectors.json")))
ADDR = V["coins"]["address"]


class FakeServer:
    """Stands in for the FierCoin explorer's /api/utxos and /api/broadcast."""

    def __init__(self, utxos=None, broadcast_error=None, offline=False):
        self.utxos_list = utxos if utxos is not None else V["coins"]["utxos"]
        self.broadcast_error = broadcast_error
        self.offline = offline
        self.sent = []

    def utxos(self, address):
        if self.offline:
            raise G.ServerDown("no internet")
        return self.utxos_list

    def broadcast(self, hexstr):
        if self.offline:
            raise G.ServerDown("no internet")
        if self.broadcast_error:
            raise G.Refused(self.broadcast_error)
        self.sent.append(hexstr)
        return V["payment"]["txid"]


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def gateway(server=None, clock=None):
    return G.Gateway(server or FakeServer(), clock=clock or Clock())


class CoinLines(unittest.TestCase):
    def test_coin_lines_match_the_examples(self):
        self.assertEqual(G.coin_lines(ADDR, V["coins"]["utxos"]), V["coins"]["lines"])

    def test_no_coins_says_none(self):
        self.assertEqual(G.coin_lines(ADDR, []), V["none"]["lines"])

    def test_ask_for_coins_over_the_radio(self):
        self.assertEqual(gateway().handle("!a1", "FIRC U " + ADDR), V["coins"]["lines"])

    def test_bad_address(self):
        reply = gateway().handle("!a1", "FIRC U hello")
        self.assertEqual(len(reply), 1)
        self.assertTrue(reply[0].startswith("FIRC err - "), reply)

    def test_gateway_without_internet_says_so(self):
        reply = gateway(FakeServer(offline=True)).handle("!a1", "FIRC U " + ADDR)
        self.assertEqual(reply, ["FIRC err - This gateway can't reach the FierCoin server right now. Try later."])


class Payments(unittest.TestCase):
    def test_parts_in_any_order_with_a_repeat_send_the_exact_payment(self):
        srv = FakeServer()
        g = gateway(srv)
        a, b = V["payment"]["lines"]
        self.assertEqual(g.handle("!a1", b), [])
        self.assertEqual(g.handle("!a1", b), [])  # a part sent twice is fine
        self.assertEqual(g.handle("!a1", a), ["FIRC ok k7q2 " + V["payment"]["txid"]])
        self.assertEqual(srv.sent, [V["payment"]["hex"]])

    def test_refused_payment_is_reported_short(self):
        g = gateway(FakeServer(broadcast_error="The network refused this payment: " + "x" * 300))
        reply = None
        for line in V["payment"]["lines"]:
            reply = g.handle("!a1", line)
        self.assertEqual(len(reply), 1)
        self.assertTrue(reply[0].startswith("FIRC err k7q2 The network refused this payment: "))
        self.assertLessEqual(len(reply[0].split(" ", 3)[3]), 150)

    def test_payment_while_gateway_offline(self):
        g = gateway(FakeServer(offline=True))
        for line in V["payment"]["lines"]:
            reply = g.handle("!a1", line)
        self.assertEqual(reply, ["FIRC err k7q2 This gateway can't reach the FierCoin server right now. Try later."])

    def test_two_senders_with_the_same_id_dont_mix(self):
        srv = FakeServer()
        g = gateway(srv)
        a, b = V["payment"]["lines"]
        self.assertEqual(g.handle("!a1", a), [])
        self.assertEqual(g.handle("!b2", b), [])
        self.assertEqual(srv.sent, [])

    def test_half_a_payment_is_forgotten_after_10_minutes(self):
        clock = Clock()
        srv = FakeServer()
        g = gateway(srv, clock)
        a, b = V["payment"]["lines"]
        g.handle("!a1", a)
        clock.t += 601
        self.assertEqual(g.handle("!a1", b), [])
        self.assertEqual(srv.sent, [])

    def test_bad_parts_are_refused(self):
        g = gateway()
        for line in ["FIRC T k7q2 1/21 AAAA", "FIRC T k7q2 3/2 AAAA", "FIRC T k7q2 1/2 AA$A", "FIRC T K7Q2 1/2 AAAA",
                     "FIRC T k7q2 1/1 " + "A" * 181]:
            reply = g.handle("!a1", line)
            self.assertEqual(len(reply), 1, line)
            self.assertTrue(reply[0].startswith("FIRC err "), (line, reply))

    def test_changing_the_part_count_midway_is_refused(self):
        g = gateway()
        g.handle("!a1", "FIRC T abcd 1/3 AAAA")
        reply = g.handle("!a1", "FIRC T abcd 2/2 AAAA")
        self.assertTrue(reply and reply[0].startswith("FIRC err abcd "), reply)

    def test_too_many_unfinished_payments_drops_the_oldest(self):
        clock = Clock()
        g = gateway(FakeServer(), clock)
        for i in range(G.MAX_PENDING + 5):
            clock.t += 1
            g.handle("!s%d" % i, "FIRC T aaaa 1/2 AAAA")
        self.assertLessEqual(len(g.pending), G.MAX_PENDING)


class Ignored(unittest.TestCase):
    def test_chat_and_other_gateways_replies_are_ignored(self):
        g = gateway()
        for text in ["hello everyone", "FIRC u dkjmgk 1/1 none", "FIRC ok k7q2 abc", "FIRC err - x", ""]:
            self.assertEqual(g.handle("!a1", text), [], text)


class Radio(unittest.TestCase):
    """The part that talks to the Meshtastic library, with a fake radio."""

    class FakeRadio:
        def __init__(self):
            self.sent = []

        def sendText(self, text, destinationId="^all", channelIndex=0, **kw):
            self.sent.append((text, destinationId, channelIndex))

    def test_channel_message_is_answered_on_the_same_channel(self):
        radio = self.FakeRadio()
        G.on_packet({"fromId": "!a1", "toId": "^all", "channel": 2, "decoded": {"text": "FIRC U " + ADDR}},
                    radio, gateway(), my_id="!gw", pause=0)
        self.assertEqual(radio.sent, [(l, "^all", 2) for l in V["coins"]["lines"]])

    def test_direct_message_is_answered_directly(self):
        radio = self.FakeRadio()
        G.on_packet({"fromId": "!a1", "toId": "!gw", "decoded": {"text": "FIRC U " + ADDR}},
                    radio, gateway(), my_id="!gw", pause=0)
        self.assertEqual(radio.sent, [(l, "!a1", 0) for l in V["coins"]["lines"]])

    def test_own_messages_are_ignored(self):
        radio = self.FakeRadio()
        G.on_packet({"fromId": "!gw", "toId": "^all", "decoded": {"text": "FIRC U " + ADDR}},
                    radio, gateway(), my_id="!gw", pause=0)
        self.assertEqual(radio.sent, [])


if __name__ == "__main__":
    unittest.main()
