export default function FounderEmptyChart({ title, message = "Sem dados temporais no período selecionado." }) {
  return (
    <div className="founder-chart founder-chart--empty" role="img" aria-label={title}>
      <p className="founder-chart-empty-message">{message}</p>
    </div>
  );
}
