import type { ReactNode } from 'react';
import type { DynamicDebriefView } from '../domain/eventSelectors.ts';
import type { ContentBundle, ProvenanceTag } from '../types/index.ts';

const EVIDENCE_LABELS: Record<ProvenanceTag, string> = {
  observed: 'Dữ liệu quan sát', inferred: 'Suy luận khoa học',
  assumption: 'Giả định mô hình', simulated: 'Kết quả mô phỏng',
};

/** Presentation of resolved results only; never computes deltas from the current plan. */
export function DynamicSTEMBrief({ view, bundle, content }: {
  view: DynamicDebriefView;
  bundle: ContentBundle;
  content?: ReactNode;
}) {
  const { summary, context, scienceBrief } = view;
  if (!summary) {
    return <section className="hail-stem-brief is-empty" aria-label="Báo cáo khoa học gần nhất">
      Chưa có báo cáo cuối Sol. Hoàn thành một Sol để xem kết quả và bài học khoa học.
    </section>;
  }
  const sourceEvent = context?.sourceEventId
    ? bundle.events.find((event) => event.id === context.sourceEventId) : null;
  const sourceChoice = sourceEvent?.choices.find((choice) => choice.id === context?.sourceChoiceId);
  const evidence = context?.evidenceType ?? scienceBrief?.provenance;
  return (
    <section className="hail-stem-brief" aria-label={`Báo cáo khoa học Sol ${summary.sol}`}>
      <div className="hail-stem-heading">
        <span className="mission-kicker">NASA STEM · Báo cáo đã hoàn thành Sol {summary.sol}</span>
        {evidence && <span className="hail-evidence-badge">{EVIDENCE_LABELS[evidence]}</span>}
      </div>
      {sourceEvent && <p className="hail-stem-context">Sự kiện: {sourceEvent.title}</p>}
      {sourceChoice && <p className="hail-stem-context">Bạn đã chọn: {sourceChoice.label}</p>}
      {context && context.metricHighlights.length > 0 && (
        <dl className="hail-stem-metrics">
          {context.metricHighlights.map((metric, index) => (
            <div key={`${metric.key}-${index}`}>
              <dt>{metric.label}</dt>
              <dd>{metric.delta > 0 ? '+' : ''}{metric.delta} {metric.unit}</dd>
            </div>
          ))}
        </dl>
      )}
      {scienceBrief ? <>
        <h3>{scienceBrief.title}</h3>
        {content ?? <p>{scienceBrief.content}</p>}
        <small>Nguồn: {scienceBrief.source}</small>
      </> : <p>Chưa có bài đọc khoa học cho báo cáo này.</p>}
    </section>
  );
}
