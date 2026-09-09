import jpeg from 'jpeg-js';
import pako from 'pako';
export function encodePng(rgba, width, height) {
    const scan = new Uint8Array(height * (width * 4 + 1));
    for (let row = 0; row < height; row++) scan.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1);
    function chunk(type, data) {
        const out = new Uint8Array(data.length + 12), v = new DataView(out.buffer); v.setUint32(0,data.length);
        out.set(Array.from(type,c=>c.charCodeAt(0)),4);out.set(data,8);
        let crc = 0xffffffff; for(let i=4;i<out.length-4;i++) { crc ^= out[i]; for(let bit=0;bit<8;bit++) crc = (crc>>>1)^((crc&1)?0xedb88320:0); }
        v.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
    }
    const header = new Uint8Array(13), view = new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
    const chunks=[Uint8Array.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',pako.deflate(scan)),chunk('IEND',new Uint8Array())];
    const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
export function decode64(value) { const s = String(value).replace(/^data:[^,]+,/, '').replace(/\s/g, ''); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) throw new Error('Invalid image data'); const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out = []; let acc = 0, bits = 0; for (const c of s.replace(/=+$/, '')) { acc = (acc << 6) | chars.indexOf(c); bits += 6; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } } return new Uint8Array(out); }
export function encode64(bytes) { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let out = ''; for (let i = 0; i < bytes.length; i += 3) { const n = (bytes[i] << 16) | ((bytes[i+1] || 0) << 8) | (bytes[i+2] || 0); out += chars[n >>> 18] + chars[(n >>> 12) & 63] + (i+1 < bytes.length ? chars[(n >>> 6) & 63] : '=') + (i+2 < bytes.length ? chars[n & 63] : '='); } return out; }
export function toPng(base64) {
    if (String(base64).length > 12 * 1024 * 1024) throw new Error('Image is too large; choose a file under 8 MB');
    let bytes = decode64(base64);
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Choose an image under 8 MB');
    let animated = false;
    if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (bytes.length < 33 || view.getUint32(8) !== 13) throw new Error('Invalid PNG header');
        const width = view.getUint32(16), height = view.getUint32(20); if (!width || !height || width * height > 4 * 1024 * 1024) throw new Error('Image dimensions exceed 4 megapixels');
        let ended = false;
        for (let offset = 8; offset + 12 <= bytes.length;) { const length = view.getUint32(offset); if (offset + length + 12 > bytes.length) throw new Error('Truncated PNG'); const type = String.fromCharCode(...bytes.subarray(offset+4, offset+8)); if (type === 'acTL') animated = true; if (type === 'IEND') { ended = true; break; } offset += length + 12; }
        if (!ended) throw new Error('Incomplete PNG');
    } else if (bytes[0] === 255 && bytes[1] === 216) {
        const decoded = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 4, maxMemoryUsageInMB: 64, tolerantDecoding: false });
        bytes = encodePng(decoded.data, decoded.width, decoded.height);
    } else throw new Error('Use PNG, APNG or JPEG. Convert HEIC, GIF and WebP externally to preserve their appearance or animation.');
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Converted PNG exceeds 8 MB');
    return { uri: 'data:image/png;base64,' + encode64(bytes), type: 'image/png', name: animated ? 'decoration.apng' : 'decoration.png', animated, bytes: bytes.length };
}
