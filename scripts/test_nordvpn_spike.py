"""Configuration boundary tests; no Docker, DNS or real credential access."""

import importlib.util
import contextlib
import io
import json
import runpy
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "nordvpn_spike", Path(__file__).with_name("nordvpn-spike.py")
)
spike = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spike)

# Generated dummy public-shaped bytes, never a service credential.
FIXTURE = """[Interface]
PrivateKey = AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
Address = 10.0.0.2/32
DNS = 10.0.0.1
[Peer]
PublicKey = AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=
AllowedIPs = 0.0.0.0/0
Endpoint = fixture.invalid:51820
"""


class ConfigTests(unittest.TestCase):
    def test_debug_events_are_opt_in_and_keep_structured_fields(self):
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            spike.log_event("vpn.test", level="debug", operation="inspect")
        self.assertEqual(output.getvalue(), "")
        with patch.object(spike, "DEBUG", True), contextlib.redirect_stderr(output):
            spike.log_event("vpn.test", level="debug", operation="inspect")
        event = json.loads(output.getvalue())
        self.assertEqual(event["operation"], "inspect")
        self.assertEqual(event["level"], "debug")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "fixture.conf"
        self.path.write_text(FIXTURE)
        self.path.chmod(0o600)

    def test_resolves_endpoint_and_leaves_dns_to_gluetun(self):
        with patch.object(
            spike.socket,
            "getaddrinfo",
            return_value=[(None, None, None, None, ("1.1.1.1", 51820))],
        ):
            output = spike.prepare_config(self.path)
        self.assertIn("Endpoint = 1.1.1.1:51820", output)
        self.assertNotIn("DNS", output)
        self.assertIn("PrivateKey", output)

    def test_refuses_readable_credentials_before_dns(self):
        self.path.chmod(0o644)
        with patch.object(spike.socket, "getaddrinfo") as dns:
            with self.assertRaises(ValueError):
                spike.prepare_config(self.path)
            dns.assert_not_called()

    def test_refuses_hooks_partial_routes_bad_keys_and_ports(self):
        for content in [
            FIXTURE.replace("DNS =", "PostUp ="),
            FIXTURE.replace("0.0.0.0/0", "10.0.0.0/8"),
            FIXTURE.replace("PrivateKey = A", "PrivateKey = !"),
            FIXTURE.replace(":51820", ":70000"),
            FIXTURE.replace("[Peer]", "[Unsupported]"),
            FIXTURE.replace(
                "PrivateKey = AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "PrivateKey = YQ==",
            ),
        ]:
            with self.subTest(content=content):
                self.path.write_text(content)
                with self.assertRaises(ValueError):
                    spike.prepare_config(self.path)

    def test_refuses_private_endpoint(self):
        with patch.object(
            spike.socket,
            "getaddrinfo",
            return_value=[(None, None, None, None, ("127.0.0.1", 51820))],
        ):
            with self.assertRaises(ValueError):
                spike.prepare_config(self.path)

    def test_subprocess_failure_does_not_echo_stderr(self):
        with patch.object(
            spike.subprocess,
            "run",
            return_value=spike.subprocess.CompletedProcess(
                [], 1, "", "fixture-sensitive-value"
            ),
        ):
            output = io.StringIO()
            with contextlib.redirect_stderr(output):
                with self.assertRaisesRegex(
                    RuntimeError, "^experiment_command_failed$"
                ):
                    spike.command(["dummy"], data="fixture-input-secret")
            event = json.loads(output.getvalue())
            self.assertEqual(event["event"], "vpn.command_failed")
            self.assertEqual(event["returnCode"], 1)
            self.assertNotIn("fixture-sensitive-value", output.getvalue())
            self.assertNotIn("fixture-input-secret", output.getvalue())

    def test_command_timeout_is_logged_without_sensitive_command_or_output(self):
        output = io.StringIO()
        with (
            patch.object(
                spike.subprocess,
                "run",
                side_effect=spike.subprocess.TimeoutExpired(
                    "fixture-secret-command", 1
                ),
            ),
            contextlib.redirect_stderr(output),
        ):
            with self.assertRaises(spike.subprocess.TimeoutExpired):
                spike.command(["dummy"])
        self.assertEqual(json.loads(output.getvalue())["event"], "vpn.command_timeout")
        self.assertNotIn("fixture-secret-command", output.getvalue())

    def test_cli_requires_opt_in_and_reports_configuration_failure_without_values(self):
        script = str(Path(__file__).with_name("nordvpn-spike.py"))
        for arguments, expected_code in [
            ([], 2),
            (["--run", "--config", str(self.path.parent / "missing.conf")], 1),
        ]:
            output, errors = io.StringIO(), io.StringIO()
            with (
                patch.object(sys, "argv", [script, *arguments]),
                patch.object(
                    spike.urllib.request,
                    "urlopen",
                    return_value=io.BytesIO(b"ip=1.0.0.1\n"),
                ),
                contextlib.redirect_stdout(output),
                contextlib.redirect_stderr(errors),
            ):
                with self.assertRaises(SystemExit) as failure:
                    runpy.run_path(script, run_name="__main__")
            self.assertEqual(failure.exception.code, expected_code)
            if expected_code == 1:
                self.assertEqual(json.loads(output.getvalue())["verdict"], "FAILED")
                self.assertNotIn("missing.conf", output.getvalue())


class WorkflowTests(unittest.TestCase):
    """Exercise real orchestration and cleanup while replacing subprocess/DNS/HTTPS edges."""

    def exercise(self, fault=None):
        calls = []
        workspaces = []
        state = {"stopped": False, "traces": 0, "logins": 0, "clients": 0}
        output, logs = io.StringIO(), io.StringIO()

        def external(args, **kwargs):
            calls.append(args)
            code, text = 0, ""
            if args[1] == "create":
                text = "fixture-container-id"
                if fault == "create":
                    code = 1
                if fault == "create-uncertain":
                    raise OSError("uncertain_create")
                if (
                    fault == "probe-create-uncertain"
                    and sum(args[1] == "create" for args in calls) == 2
                ):
                    raise spike.subprocess.TimeoutExpired("fixture", 1)
            elif args[1] == "inspect":
                text = "false" if fault == "exited" else "true"
            elif args[1] == "logs":
                text = (
                    "Normal startup\nERROR permission denied /dev/net/tun 2.2.2.2 "
                    + "Z" * 44
                )
            elif args[1] == "rm" and fault in {
                "cleanup",
                "cleanup-timeout",
                "cleanup-os",
            }:
                if fault == "cleanup-timeout":
                    raise spike.subprocess.TimeoutExpired("fixture", 1)
                if fault == "cleanup-os":
                    raise OSError("fixture transport failure")
                code = 1
            elif "pgrep" in args:
                state["clients"] += 1
                code = int(fault == "client" or state["clients"] == 1)
            elif "nslookup" in args:
                code = int(
                    fault == "dns-baseline" or state["stopped"] and fault != "dns-leak"
                )
            elif "curl" in args:
                data = kwargs.get("input") or ""
                if "auth/login" in data:
                    state["logins"] += 1
                    if fault != "auth" and state["logins"] > 1:
                        text = "HTTP/1.1 204 No Content\r\nSet-Cookie: QBT_SID_8080=fixture-cookie; path=/\r\n\r\n"
                elif "app/preferences" in data:
                    text = json.dumps(
                        {
                            field: fault == "discovery"
                            for field in ["dht", "pex", "lsd", "upnp"]
                        }
                    )
                elif "8000/v1/vpn/status" in args[-1]:
                    state["stopped"] = "stopped" in data
                elif "www.cloudflare.com" in args[-1]:
                    code = int(fault == "dns")
                elif "2606:" in args[-1]:
                    code = 0 if fault == "ipv6-leak" else 7
                else:
                    state["traces"] += 1
                    code = int(
                        state["traces"] == 1
                        or fault in {"timeout", "exited"}
                        or state["stopped"]
                        and fault != "ipv4-leak"
                    )
                    text = (
                        "ip="
                        + (
                            "1.0.0.1"
                            if fault == "egress"
                            or fault == "recovered-egress"
                            and state["traces"] > 5
                            else "2.2.2.2"
                        )
                        + "\n"
                    )
            return spike.subprocess.CompletedProcess(args, code, text, "")

        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "fixture.conf"
            path.write_text(FIXTURE)
            path.chmod(0o600)
            with contextlib.ExitStack() as stack:
                stack.enter_context(
                    patch.object(spike.subprocess, "run", side_effect=external)
                )
                stack.enter_context(
                    patch.object(
                        spike.socket,
                        "getaddrinfo",
                        return_value=[(None, None, None, None, ("1.1.1.1", 51820))],
                    )
                )
                stack.enter_context(
                    patch.object(
                        spike.urllib.request,
                        "urlopen",
                        return_value=io.BytesIO(b"ip=1.0.0.1\n"),
                    )
                )
                original_mkdtemp = spike.tempfile.mkdtemp

                def workspace(**kwargs):
                    created = original_mkdtemp(**kwargs)
                    workspaces.append(Path(created))
                    return created

                stack.enter_context(
                    patch.object(spike.tempfile, "mkdtemp", side_effect=workspace)
                )
                stack.enter_context(patch.object(spike.time, "sleep"))
                stack.enter_context(contextlib.redirect_stdout(output))
                stack.enter_context(contextlib.redirect_stderr(logs))
                if fault:
                    with self.assertRaises(
                        (RuntimeError, OSError, spike.subprocess.TimeoutExpired)
                    ) as failure:
                        spike.run(path)
                    result = str(failure.exception)
                else:
                    result = spike.run(path)
        for workspace in workspaces:
            if fault in {"cleanup", "cleanup-timeout", "cleanup-os"}:
                self.assertTrue(workspace.exists())
                self.assertEqual((workspace / "wg0.conf").stat().st_mode & 0o777, 0o600)
                spike.shutil.rmtree(workspace)
            else:
                self.assertFalse(workspace.exists())
        return result, calls, output.getvalue(), logs.getvalue()

    def test_connected_stopped_recovered_and_reverse_cleanup(self):
        result, calls, _, logs = self.exercise()
        self.assertTrue(result["egressDiffersFromHost"])
        self.assertTrue(result["stoppedDirectDnsBlocked"])
        self.assertTrue(result["reconnected"])
        created = [
            args[args.index("--name") + 1] for args in calls if args[1] == "create"
        ]
        self.assertEqual(
            [args[-1] for args in calls if args[1] == "rm"], list(reversed(created))
        )
        self.assertIn("vpn.cleanup_completed", logs)
        self.assertNotIn("fixture-cookie", logs)

    def test_failure_paths_refuse_success_and_clean_created_resources(self):
        expected = {
            "timeout": "vpn_connection_timeout",
            "exited": "vpn_exited_before_connection",
            "egress": "vpn_egress_matches_host",
            "client": "download_client_not_running",
            "auth": "client_authenticated_api_unavailable",
            "discovery": "client_discovery_not_disabled",
            "dns": "tunnel_dns_failed",
            "dns-baseline": "direct_dns_probe_has_no_connected_baseline",
            "ipv4-leak": "tunnel_stop_did_not_block_all_probes",
            "ipv6-leak": "tunnel_stop_did_not_block_all_probes",
            "dns-leak": "tunnel_stop_did_not_block_all_probes",
            "create": "experiment_command_failed",
            "create-uncertain": "uncertain_create",
            "probe-create-uncertain": "Command 'fixture' timed out after 1 seconds",
            "cleanup": "experiment_cleanup_failed",
            "cleanup-timeout": "experiment_cleanup_failed",
            "cleanup-os": "experiment_cleanup_failed",
            "recovered-egress": "vpn_recovered_egress_matches_host",
        }
        for fault, error in expected.items():
            with self.subTest(fault=fault):
                result, calls, output, logs = self.exercise(fault)
                self.assertEqual(result, error)
                removed = [args for args in calls if args[1] == "rm"]
                self.assertEqual(
                    len(removed), 1 if fault in {"create", "create-uncertain"} else 2
                )
                self.assertNotIn("Z" * 44, output + logs)
                self.assertNotIn("2.2.2.2", output + logs)


if __name__ == "__main__":
    unittest.main()
