# Quote API Microservice

Lightweight, high-performance quote card rendering engine built with [Bun](https://bun.sh) and [makeitaquote](https://www.npmjs.com/package/makeitaquote).

Natively supports:
- **Light background & dark background**
- **Avatar flip** (left or right)
- **Modern full-bleed layout (`new`) and classic (`side`)**
- **Full color or grayscale avatars**
- **Custom watermarks**
- **Single-frame GIFs & PNGs**
- **Unicode-rendered markdown formatting**

## Quick Start (Local / Bun)

```bash
bun install
bun run src/server.ts
```

## Docker Deployment (VPS)

```bash
docker compose up -d --build
```

### Caddy Reverse Proxy Example

```caddy
quote.allyapp.cc {
    reverse_proxy 127.0.0.1:8081
}
```
