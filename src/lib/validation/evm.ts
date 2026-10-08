/** EVM address format: 0x followed by 40 hexadecimal characters. */
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

export function isEvmAddress(value: string): boolean {
  return EVM_RE.test(value);
}
