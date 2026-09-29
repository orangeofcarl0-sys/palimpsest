"""Sanitize the R1-S evidence: replace rig and user-profile absolute paths with placeholders.

Kept as a file rather than a heredoc because a shell heredoc mangles the backslashes in Windows path
literals, and the patterns are built without backslash escapes because a raw string containing `\\U` is an
invalid escape.
"""
import io
import re

BS = chr(92)
RIG = "C:" + BS + "Users" + BS + "66494" + BS + ".palimpsest-r1s"
# Any absolute Windows path under a user profile, and any POSIX-style one.
WIN_USER = "[A-Za-z]:" + re.escape(BS) + "{1,2}Users" + re.escape(BS) + "{0,2}" + '[^"]*'
POSIX_USER = r"[A-Za-z]:/Users/[^\"\s,]+"
# A DSH install path is a host fact, not evidence a reader needs: keep only the package name.
WIN_DSH = "[A-Za-z]:" + re.escape(BS) + "{1,2}" + re.escape(BS) + "?[^\"\\s]*npm[^\"\\s]*"


def sanitize(text):
    text = text.replace(RIG, "<rig>")
    text = text.replace(RIG.replace(BS, "/"), "<rig>")
    text = re.sub(re.escape(RIG).replace(re.escape(BS), re.escape(BS) + "{1,2}"), "<rig>", text)
    text = re.sub(WIN_DSH, "<dsh-install>", text)
    text = re.sub(WIN_USER, "<home>", text)
    text = re.sub(POSIX_USER, "<home>", text)
    return text


path = "research-evidence/r1-s/audit.json"
original = io.open(path, encoding="utf-8").read()
updated = sanitize(original)
io.open(path, "w", encoding="utf-8", newline="").write(updated)
remaining = re.findall(r"[A-Za-z]:" + re.escape(BS) + "{1,2}", updated)
print("sanitized; remaining drive-letter paths:", len(remaining))
