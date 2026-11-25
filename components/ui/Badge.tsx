type Color = 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple' | 'orange';

interface Props {
  label: string;
  color?: Color;
  size?: 'sm' | 'md';
}

const colorClasses: Record<Color, string> = {
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray: 'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
};

export function Badge({ label, color = 'gray', size = 'sm' }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full font-medium
      ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}
      ${colorClasses[color]}`}
    >
      {label}
    </span>
  );
}

export function statusBadge(status: string) {
  const map: Record<string, Color> = {
    Scheduled: 'blue', Confirmed: 'green', 'In-Progress': 'orange',
    Completed: 'gray', Cancelled: 'red', 'No-Show': 'red',
    Waiting: 'yellow', Skipped: 'purple', Referred: 'purple',
  };
  return <Badge label={status} color={map[status] ?? 'gray'} />;
}
