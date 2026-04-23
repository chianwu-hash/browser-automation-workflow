# PowerShell Encoding Notes

## Rule

Do not place Chinese prompt text directly inside inline PowerShell automation unless there is no alternative.

## Preferred Pattern

1. Save prompt text in a UTF-8 file.
2. Let the script read the file directly.

## Why

Inline PowerShell text can become mojibake when passed through:

- here-strings
- shell piping
- nested command execution
- mixed toolchains

## Safe Default

Use prompt files for:

- Chinese prompts
- long prompts
- reusable prompts
- prompts that need version control
