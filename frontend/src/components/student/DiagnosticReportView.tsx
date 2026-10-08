import React from 'react';
import { useApp } from '../../context/AppContext';
import { 
  ArrowLeft, 
  Activity, 
  Mic,
  AlertTriangle,
  ShieldAlert,
  Ban,
  ListChecks
} from 'lucide-react';

export const DiagnosticReportView: React.FC = () => {
  const { latestReport, setActiveView } = useApp();

  if (!latestReport) return null;

  const isDisqualified = latestReport.isDisqualified || latestReport.tabSwitches >= 4;

  // The badge follows the score — it used to say "Placement Ready" for every report
  const readiness = latestReport.overallScore >= 80
    ? { label: 'Placement Ready', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80' }
    : latestReport.overallScore >= 60
      ? { label: 'Almost Ready', className: 'bg-amber-50 text-amber-700 border-amber-200/80' }
      : { label: 'Needs Practice', className: 'bg-rose-50 text-rose-700 border-rose-200/80' };
  const paceMeasured = latestReport.averageWpm > 0;
  const communicationParts = [
    { label: 'Fluency', value: latestReport.fluencyScore, suffix: '/100', weight: '35%' },
    { label: 'Pace', value: paceMeasured ? latestReport.averageWpm : undefined, suffix: ' WPM', weight: '25%', note: latestReport.paceLabel ?? undefined },
    { label: 'Filler words', value: latestReport.totalFillerWords, suffix: '', weight: '20%' },
    { label: 'Clarity & tone', value: latestReport.clarityScore, suffix: '/100', weight: '20%' },
  ];
  const hasBreakdown = latestReport.fluencyScore !== undefined;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8 animate-in fade-in duration-200">
      
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveView('DASHBOARD')}
          className="flex items-center space-x-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Student Dashboard</span>
        </button>

        <span className="px-2.5 py-1 text-xs font-mono font-medium bg-neutral-100 text-neutral-600 rounded-md border border-neutral-200">
          SESSION #{latestReport.id.toUpperCase()}
        </span>
      </div>

      {isDisqualified && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 flex items-start space-x-3.5 text-rose-950 shadow-xs animate-in slide-in-from-top duration-200">
          <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-900">
              Session Terminated &amp; Candidate Disqualified
            </h3>
            <p className="text-xs text-rose-800 leading-relaxed">
              This interview session was terminated because <strong>4 tab switches were detected</strong>. In accordance with college placement proctoring rules, an overall readiness score of <strong>0 / 100</strong> was recorded and you are permanently disqualified from re-attending this interview.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                isDisqualified ? 'bg-rose-600 text-white' : 'bg-neutral-900 text-white'
              }`}>
                {isDisqualified ? 'DISQUALIFIED' : 'EVALUATION COMPLETE'}
              </span>
              <span className="text-xs text-neutral-500 font-mono">{latestReport.date}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              Placement Communication Scorecard
            </h1>
          </div>

          <div className="flex flex-col items-center justify-center p-6 bg-neutral-50 border border-neutral-200/80 rounded-2xl text-center">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider font-mono">Overall Readiness</p>
            <div className="flex items-baseline space-x-1 my-1">
              <span className={`text-5xl font-black tracking-tight ${isDisqualified ? 'text-rose-600' : 'text-neutral-900'}`}>
                {latestReport.overallScore}
              </span>
              <span className="text-base text-neutral-400 font-medium">/100</span>
            </div>
            {isDisqualified ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300 mt-1">
                Disqualified
              </span>
            ) : (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border mt-1 ${readiness.className}`}>
                {readiness.label}
              </span>
            )}
            {latestReport.questionsAnswered !== undefined && latestReport.questionsPlanned !== undefined && (
              <span className="text-[10px] text-neutral-400 font-mono mt-1.5">
                {latestReport.questionsAnswered} of {latestReport.questionsPlanned} questions answered
              </span>
            )}
          </div>

        </div>

        <div className="grid grid-cols-3 gap-4 pt-6 mt-6 border-t border-neutral-100 text-center">
          <div className="p-3">
            <p className="text-[11px] text-neutral-400 font-mono uppercase">Technical Depth</p>
            <p className="text-xl font-bold text-neutral-900 mt-0.5">{latestReport.technicalScore}%</p>
          </div>
          <div className="p-3 border-x border-neutral-100">
            <p className="text-[11px] text-neutral-400 font-mono uppercase">Clarity & Delivery</p>
            <p className="text-xl font-bold text-neutral-900 mt-0.5">{latestReport.communicationScore}%</p>
          </div>
          <div className="p-3">
            <p className="text-[11px] text-neutral-400 font-mono uppercase">Proctoring Status</p>
            <p className={`text-xl font-bold mt-0.5 font-mono ${isDisqualified ? 'text-rose-600' : 'text-emerald-600'}`}>
              {latestReport.tabSwitches} Switches {isDisqualified ? '(DISQUALIFIED)' : ''}
            </p>
          </div>
        </div>

        {hasBreakdown && !isDisqualified && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-neutral-100">
            {communicationParts.map(part => (
              <div key={part.label} className="p-3 bg-neutral-50 border border-neutral-200/70 rounded-xl">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">{part.label} · {part.weight}</p>
                <p className="text-base font-bold text-neutral-900 mt-0.5">
                  {part.value === undefined ? 'Not measured' : `${part.value}${part.suffix}`}
                </p>
                {part.note && <p className="text-[10px] text-neutral-500">{part.note}</p>}
              </div>
            ))}
            {(latestReport.longPauses !== undefined || latestReport.averageResponseLatencySec != null) && (
              <p className="col-span-2 sm:col-span-4 text-[11px] text-neutral-500">
                {latestReport.longPauses ?? 0} long pause(s) while answering
                {latestReport.averageResponseLatencySec != null && ` · ${latestReport.averageResponseLatencySec}s average time to start answering`}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-neutral-700" />
              <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Speaking Pace Meter</h3>
            </div>
            <span className="text-xs font-mono font-medium text-neutral-500">Target: 120-150 WPM</span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-neutral-900">{paceMeasured ? latestReport.averageWpm : '—'}</span>
            <span className="text-xs text-neutral-500 font-medium">
              {paceMeasured ? `Words Per Minute${latestReport.paceLabel ? ` · ${latestReport.paceLabel}` : ''}` : 'Not enough speech to measure pace'}
            </span>
          </div>

          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-neutral-900 h-full rounded-full" 
              style={{ width: `${Math.min(100, (latestReport.averageWpm / 160) * 100)}%` }} 
            />
          </div>
        </div>

        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Mic className="w-4 h-4 text-neutral-700" />
              <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Filler Word Density</h3>
            </div>
            <span className="text-xs font-mono font-medium text-neutral-500">Total: {latestReport.totalFillerWords} detected</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.keys(latestReport.fillerWordBreakdown).length === 0 && (
              <p className="text-xs text-neutral-500">No filler words detected.</p>
            )}
            {Object.entries(latestReport.fillerWordBreakdown).map(([word, count]) => (
              <div key={word} className="flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs">
                <span className="font-medium text-neutral-800">"{word}"</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-mono text-[10px]">x{Number(count)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-semibold tracking-tight text-neutral-900">
          Technical Skill Competency Analysis
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {latestReport.skillBreakdown.map((item, idx: number) => (
            <div key={idx} className="p-3.5 bg-neutral-50 border border-neutral-200/70 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900">{item.skill}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  item.status === 'STRONG' ? 'bg-emerald-100 text-emerald-800' :
                  item.status === 'MODERATE' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {item.score}% · {item.status}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed">{item.recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {latestReport.actionableNextSteps.length > 0 && (
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center space-x-2">
            <ListChecks className="w-4 h-4 text-neutral-700" />
            <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Your Next Steps</h3>
          </div>
          <ol className="space-y-2 list-decimal list-inside text-xs text-neutral-700 leading-relaxed">
            {latestReport.actionableNextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {latestReport.turns && latestReport.turns.length > 0 && (
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-3">
          <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Question-by-Question Review</h3>
          <div className="space-y-2.5">
            {latestReport.turns.map(turn => (
              <div key={turn.turn} className="p-3.5 bg-neutral-50 border border-neutral-200/70 rounded-xl space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold text-neutral-900">Q{turn.turn}. {turn.question}</p>
                  <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200 text-neutral-700">
                    {turn.difficulty} · {turn.overallScore}/100
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500 font-mono">
                  Technical {turn.technicalScore} · Communication {turn.communicationScore}
                  {turn.wpm !== null && ` · ${turn.wpm} WPM`} · {turn.fillerCount} filler(s)
                  {turn.pauseCount ? ` · ${turn.pauseCount} long pause(s)` : ''}
                </p>
                {turn.pointsCovered.length > 0 && (
                  <p className="text-[11px] text-emerald-700">Covered: {turn.pointsCovered.join(' · ')}</p>
                )}
                {turn.pointsMissed.length > 0 && (
                  <p className="text-[11px] text-amber-700">Missed: {turn.pointsMissed.join(' · ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {latestReport.scoringMethod && latestReport.scoringMethod.length > 0 && (
        <div className="bg-neutral-50 border border-neutral-200/90 rounded-2xl p-5 space-y-2">
          <h3 className="text-xs font-semibold tracking-tight text-neutral-700 uppercase font-mono">How this score was calculated</h3>
          <ul className="space-y-1 list-disc list-inside text-[11px] text-neutral-600 leading-relaxed">
            {latestReport.scoringMethod.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};
