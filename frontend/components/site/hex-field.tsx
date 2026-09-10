/**
 * A faint field of transfer-hash hex drifting behind the community section,
 * radially masked so it burns brightest at the centre. Deterministic content
 * (no render-time randomness), and the drift is disabled under
 * prefers-reduced-motion via globals.css.
 */
const LINES = [
  "0x7f3a9c1e04b8d26af51c093e7b4e18a0d9c62f37e18b0a24cd5e91f0473ab2c68d1904f7a3b",
  "e2b8f04519a37c6e0d8241bf93a05e7c1f6d20934ab7c58e0139fbe4a276c8d05e91f0473ab2c",
  "0x1f7d7550b1b028f7571e69a784071f0205fd2efa 8366a39cc670b4001a1121b8f6a443a643e",
  "a05e7c1f6d20934ab7c58e0139fbe4a276c8d05e91f0473ab2c68d1904f7a3be2b8f04519a37c",
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73 5fc5360d0400a0fd4f2af552add042d716f",
  "c093e7b4e18a0d9c62f37e18b0a24cd5e91f0473ab2c68d1904f7a3be2b8f04519a37c6e0d824",
  "0xca11bde05977b3631167028862be2a173976ca11 f3334192d15450cdd385c8b70e03f9a6bd",
  "9fbe4a276c8d05e91f0473ab2c68d1904f7a3be2b8f04519a37c6e0d8241bf93a05e7c1f6d209",
  "0x58daec3116aae6d93017baaea7749052e8a04fa7 4663 46630 sqrtPriceX96 L div sqrtP",
  "34ab7c58e0139fbe4a276c8d05e91f0473ab2c68d1904f7a3be2b8f04519a37c6e0d8241bf93a",
];

export function HexField() {
  const rows = Array.from({ length: 34 }, (_, i) => LINES[i % LINES.length].repeat(3));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-composite:intersect] [-webkit-mask-composite:source-in] [mask-image:linear-gradient(90deg,#000,#0000_38%,#0000_62%,#000),linear-gradient(#0000,#000_14%,#000_86%,#0000)]"
    >
      <div className="animate-hex-drift absolute inset-x-0 top-0 flex flex-col gap-1.5 whitespace-pre text-center font-mono text-[11px] leading-[1.7] tracking-wide text-lime/[0.12]">
        {[...rows, ...rows].map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
