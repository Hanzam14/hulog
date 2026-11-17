/** Keep the formatter's text intact while separating the visual money roles. */
export default function Money({ value }: { value: string }) {
  const parts = value.match(/^(.*?₱)([\d,]+)(\.\d{2})$/);
  if (!parts) return <span className="money">{value}</span>;
  return (
    <span className="money">
      <span className="money-sign">{parts[1]}</span>
      <span className="money-whole">{parts[2]}</span>
      <span className="sr-only">{parts[3][0]}</span>
      <span className="money-centavos">{parts[3].slice(1)}</span>
    </span>
  );
}
