# Archived evidence provenance

The evidence files under this directory are read-only transcriptions of the release-desk archive
topics requested at the overnight shift boundary. The previous shift's committed record is
`dispatch/previous-shift` at `584d61c4bd5ae71bcb1fa687e9b3ad053da4f509`.

The exact archived terminal row at 22:03:17 is:

```text
22:03:17	p17	B	40	req-a	S
```

`S` means the panel suppressed that transport delivery; it did not paint it. The previous-shift blob
for `terminal.tsv` is `0d60f4df58d0070b6a53cee94f436e078a1f1e44`. A review candidate had changed the
event to `P` (blob `8535188d70f9915414256ec89f33916fa6d8e200`), which incorrectly implied a live
Birch inversion. The `S` row is restored here.

`field-archive.txt` is the Desk B addendum; `field-note.txt` is the 22:14Z field note. They are kept
as separate source records so the replay can distinguish the clock/time-basis amendment from the
unattributed notebook observation. The inventory, ingress and reservation files match the previous
shift's archived records. `operations/registry.csv` remains the repository's current/older alias
crosswalk.

Only `P` terminal rows are paints. Do not treat `S` as displayed data. The terminal archive's row
order is authoritative; its wall clocks do not order the event stream.
