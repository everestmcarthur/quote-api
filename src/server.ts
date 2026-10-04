import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MiQ } from "makeitaquote";

const PORT = Number(process.env.PORT || 8081);
const CACHE_DIR = join(import.meta.dir, "../cache");
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// In-memory image buffer cache for ultra-fast serving (up to 500 images)
const imageCache = new Map<string, { buffer: Buffer; mime: string; created: number }>();
const MAX_CACHE_SIZE = 500;
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

function pruneCache() {
  const now = Date.now();
  for (const [key, item] of imageCache.entries()) {
    if (now - item.created > CACHE_LIFETIME_MS) {
      imageCache.delete(key);
    }
  }
}
setInterval(pruneCache, 15 * 60 * 1000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface QuotePayload {
  text?: string;
  avatar?: string;
  username?: string;
  display_name?: string;
  displayName?: string;
  color?: boolean;
  bold?: boolean;
  light?: boolean;
  flip?: boolean;
  new?: boolean;
  layout?: "side" | "new";
  gif?: boolean;
  watermark?: string;
  raw?: boolean;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "quote-api",
        engine: "makeitaquote",
        version: "12.1.2",
        cachedImages: imageCache.size,
      }, { headers: corsHeaders });
    }

    // Serve cached image
    if (url.pathname.startsWith("/image/")) {
      const filename = url.pathname.slice("/image/".length);
      const cached = imageCache.get(filename);
      if (cached) {
        return new Response(cached.buffer, {
          headers: {
            "Content-Type": cached.mime,
            "Cache-Control": "public, max-age=86400, immutable",
            ...corsHeaders,
          },
        });
      }

      const filePath = join(CACHE_DIR, filename);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const mime = filename.endsWith(".gif") ? "image/gif" : "image/png";
        return new Response(file, {
          headers: {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=86400, immutable",
            ...corsHeaders,
          },
        });
      }

      return new Response("Image not found", { status: 404, headers: corsHeaders });
    }

    // Quote generation endpoint (/fakequote or /quote)
    if (
      req.method === "POST" &&
      (url.pathname === "/fakequote" || url.pathname === "/quote" || url.pathname === "/api/quote")
    ) {
      try {
        const body = (await req.json().catch(() => ({}))) as QuotePayload;
        const text = body.text || "...";
        const avatar = body.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
        const username = body.username || "User";
        const displayName = body.display_name || body.displayName || username;

        const miq = new MiQ()
          .setText(text)
          .setAvatar(avatar)
          .setUsername(username)
          .setDisplayName(displayName);

        if (body.watermark && typeof body.watermark === "string" && body.watermark.trim()) {
          miq.setWatermark(body.watermark.trim());
        }

        const isLight = Boolean(body.light);
        const isFlip = Boolean(body.flip);
        const isNew = Boolean(body.new || body.layout === "new");
        const isColor = Boolean(body.color);

        miq.setTheme({
          extends: isLight ? "light" : "dark",
          layout: isNew ? "new" : "side",
          avatar: {
            position: isFlip ? "right" : "left",
            grayscale: !isColor,
          },
        });

        const format = body.gif ? "gif" : "png";
        const mime = body.gif ? "image/gif" : "image/png";
        const buffer = await miq.toBuffer(format);

        // Raw image response requested
        if (body.raw || url.searchParams.get("raw") === "true") {
          return new Response(buffer, {
            headers: {
              "Content-Type": mime,
              ...corsHeaders,
            },
          });
        }

        const id = randomUUID();
        const filename = `${id}.${format}`;
        const filePath = join(CACHE_DIR, filename);

        // Save to in-memory map & disk
        if (imageCache.size >= MAX_CACHE_SIZE) {
          const firstKey = imageCache.keys().next().value;
          if (firstKey) imageCache.delete(firstKey);
        }
        imageCache.set(filename, { buffer, mime, created: Date.now() });
        await Bun.write(filePath, buffer);

        // Determine host header or configured public URL
        const host = req.headers.get("host") || `127.0.0.1:${PORT}`;
        const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
        const imageUrl = `${proto}://${host}/image/${filename}`;

        return Response.json(
          {
            success: true,
            url: imageUrl,
            id,
            format,
            size: buffer.length,
          },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        console.error("[QuoteAPI] Error rendering quote:", err);
        return Response.json(
          {
            success: false,
            error: err?.message || String(err),
          },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`[QuoteAPI] Server listening on http://127.0.0.1:${server.port}`);
