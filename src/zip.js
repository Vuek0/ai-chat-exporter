// Минимальный сборщик ZIP без библиотек.
// Сжатие — встроенный в Chrome CompressionStream("deflate-raw"); если его нет — файлы без сжатия.
// Имена файлов в UTF-8 (флаг 0x0800) + поле Info-ZIP Unicode Path, чтобы кириллица читалась везде.
(() => {
  const ACE = (globalThis.__ACE__ = globalThis.__ACE__ || {});
  if (ACE.makeZip) return;

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function deflate(data) {
    if (typeof CompressionStream === "undefined") return null;
    try {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (_) {
      return null;
    }
  }

  function dosDateTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  // Поле 0x7075 (Info-ZIP Unicode Path): версия 1, CRC32 имени, имя в UTF-8
  function unicodePathExtra(nameBytes) {
    const v = new DataView(new ArrayBuffer(9));
    v.setUint16(0, 0x7075, true);
    v.setUint16(2, 5 + nameBytes.length, true);
    v.setUint8(4, 1);
    v.setUint32(5, crc32(nameBytes), true);
    const out = new Uint8Array(9 + nameBytes.length);
    out.set(new Uint8Array(v.buffer), 0);
    out.set(nameBytes, 9);
    return out;
  }

  // files: [{ name: "dir/file.json", data: string | Uint8Array }] → Blob (application/zip)
  ACE.makeZip = async (files) => {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const name = enc.encode(f.name);
      const raw = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(raw);
      const packed = await deflate(raw);
      const useDeflate = packed && packed.length < raw.length;
      const body = useDeflate ? packed : raw;
      const method = useDeflate ? 8 : 0;
      const extra = unicodePathExtra(name);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true); // версия для распаковки
      lh.setUint16(6, 0x0800, true); // имя в UTF-8
      lh.setUint16(8, method, true);
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, body.length, true);
      lh.setUint32(22, raw.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, extra.length, true);
      chunks.push(new Uint8Array(lh.buffer), name, extra, body);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, method, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, body.length, true);
      ch.setUint32(24, raw.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(30, extra.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name, extra);

      offset += 30 + name.length + extra.length + body.length;
    }

    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  };
})();
