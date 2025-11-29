import { BetaBadge } from '@/components/custom/beta-badge';
import { useEmbedding } from '@/components/embed-provider';

export const DashboardPageHeader = ({
  title,
  children,
  description,
  beta = false,
}: {
  title: string;
  children?: React.ReactNode;
  description?: React.ReactNode;
  beta?: boolean;
}) => {
  const { embedState } = useEmbedding();

  if (embedState.hidePageHeader) {
    return null;
  }
  return (
    <div className="flex items-center justify-between mb-6 min-w-full px-4 z-30 -mx-4">
      <div className="flex items-center justify-between w-full">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{title}</h1>
            {/* New Officesphere staging badge */}
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
              Officesphere – Staging
            </span>
            {beta && (
              <div className="flex items-center">
                <BetaBadge />
              </div>
            )}
          </div>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};
