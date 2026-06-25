import './TradingResearch.css';

function resolveResearchDocUrl() {
  const query = 'scope=trading&embed=1';
  if (typeof window === 'undefined') {
    return `/notes/doc?${query}`;
  }

  const { protocol, hostname, port } = window.location;
  if (port === '5173') {
    return `${protocol}//${hostname}:5174/notes/doc?${query}`;
  }
  return `/notes/doc?${query}`;
}

export default function TradingResearch() {
  const researchDocUrl = resolveResearchDocUrl();

  return (
    <div className="research-page">
      <div className="research-frame-shell">
        <iframe
          className="research-frame"
          title="交易研究文档"
          src={researchDocUrl}
        />
      </div>
    </div>
  );
}
