"""Sanitize the R1-R evidence: replace the rig's absolute paths with placeholders.

Run from the repository root. Kept as a file rather than a heredoc because a shell heredoc mangles the
backslashes in Windows path literals, and built without backslash escapes in the patterns because a raw
string containing `\\U` is an invalid escape.
"""
import glob
import io
import os
import re

BS = chr(92)
RIG = "C:" + BS + "Users" + BS + "66494" + BS + ".palimpsest-r1r"

# A Windows absolute path under a user profile: drive, separator, "Users", separator, then a run of
# characters that are not a quote, backslash, whitespace or comma.
WIN_USER = "[A-Za-z]:" + re.escape(BS) + "{1,2}Users" + re.escape(BS) + "{1,2}" + '[^"' + re.escape(BS) + r"\s,]+"
POSIX_USER = r'[A-Za-z]:/[Uu]sers/[^"\s,]+'


def sanitize(text):
    # The RIG path is replaced FIRST, before the generic user-profile rule, because that rule consumes
    # the `C:\Users\<user>` prefix and would leave the rig-specific tail (`\.palimpsest-r1r\...`)
    # stranded in the artifact — which is exactly what an earlier pass of this script produced.
    text = text.replace(RIG, "<rig>")
    text = text.replace(RIG.replace(BS, "/"), "<rig>")
    # Any remaining absolute path under a user profile.
    text = re.sub(WIN_USER, "<home>", text)
    text = re.sub(POSIX_USER, "<home>", text)
    # A rig tail that survived because its prefix was already replaced.
    text = re.sub(re.escape(BS) + r"\.palimpsest-r1r" + '[^"]*', "<rig-path>", text)
    text = re.sub(r"/\.palimpsest-r1r" + '[^"]*', "<rig-path>", text)
    return text


changed = 0
for path in glob.glob("research-evidence/r1-r/**/*", recursive=True):
    if not os.path.isfile(path):
        continue
    try:
        original = io.open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, OSError):
        continue
    updated = sanitize(original)
    if updated != original:
        io.open(path, "w", encoding="utf-8", newline="").write(updated)
        changed += 1

print("sanitized", changed, "files")
