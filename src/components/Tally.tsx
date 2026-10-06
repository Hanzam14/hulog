/** One row of the paper tally: a box per day, crossed when paid. */
export default function Tally({
  label,
  paid,
  pending,
  total,
}: {
  label: string;
  paid: number;
  pending: number;
  total: number;
}) {
  const marks = Array.from({ length: total }, (_, i) =>
    i < paid ? "paid" : i < paid + pending ? "pending" : "open",
  );
  return (
    <div
      className="tally"
      role="img"
      aria-label={`${label}: ${paid} of ${total} days paid, ${pending} pending`}
    >
      {marks.map((mark, i) => (
        <span key={i} className={mark} />
      ))}
    </div>
  );
}
