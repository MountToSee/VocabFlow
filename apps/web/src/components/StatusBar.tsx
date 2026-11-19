import type { AnalysisStrategy, Capabilities } from '@vocabflow/shared';
import type { ConnectionStatus } from '../lib/socket';

interface Props {
  status: ConnectionStatus;
  capabilities: Capabilities | null;
  analyzing: boolean;
  strategy: AnalysisStrategy | null;
  latencyMs: number | null;
  wordCount: number;
  issueCount: number;
}

const STRATEGY_LABEL: Record<AnalysisStrategy, string> = {
  'cloud-llm': 'Cloud AI',
  'local-llm': 'Local AI',
  'heuristics-only': 'Offline rules',
};

export function StatusBar(props: Props) {
  const { status, capabilities, analyzing, strategy, latencyMs, wordCount, issueCount } = props;
  return (
    <footer className="statusbar">
      <span className={`dot dot-${status}`} aria-hidden />
      <span>
        {status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
      </span>
      {capabilities && (
        <span className="muted">
          Dictionary: {capabilities.macosDictionary ? 'macOS' : 'built-in'}
        </span>
      )}
      <span className="muted">
        {analyzing
          ? 'Analyzing…'
          : strategy
            ? `${STRATEGY_LABEL[strategy]}${latencyMs !== null ? ` · ${latencyMs} ms` : ''}`
            : ''}
      </span>
      <span className="spacer" />
      <span className="muted">
        {issueCount} suggestion{issueCount === 1 ? '' : 's'}
      </span>
      <span className="muted">
        {wordCount} word{wordCount === 1 ? '' : 's'}
      </span>
    </footer>
  );
}
