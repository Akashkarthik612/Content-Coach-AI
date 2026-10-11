# Third-party notices

## Dust (dust-tt/dust)

Parts of the knowledge-ingestion pipeline are adapted from [Dust](https://github.com/dust-tt/dust),
pinned at commit `b92c73c0a5a9e36de668e0b9377f3ccf6749a082`. Ported files carry the header
`# Adapted from dust-tt/dust (MIT License, Copyright (c) 2022 Stanislas Polu)`.

| Honne file | Adapted from |
|---|---|
| `backend/knowledge/splitter.py` | `core/src/data_sources/splitter.rs` (the `base_v0` splitter; its tests are ported as golden tests in `backend/knowledge/tests/test_splitter.py`) |
| `backend/knowledge/connectors/gdrive.py` | `connectors/src/connectors/google_drive/` (incremental sync rules, start-page-token ordering, folder-selection check) |

The ideas behind `diff.py` (chunk hashes and embedding only the chunks that changed) also come from
`core/src/data_sources/data_source.rs`. That code was re-implemented, not copied.

```
Copyright (c) 2022 Stanislas Polu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
