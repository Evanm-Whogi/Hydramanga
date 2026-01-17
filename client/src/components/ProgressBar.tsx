interface ProgressBarProps {
  progress: number;
  color?: string;
}

const ProgressBar = ({ progress, color }: ProgressBarProps) => {
  // Ensure progress stays between 0 and 100
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const finished = clampedProgress === 100;

  // Determine gradient based on color prop or default colors
  const gradient = finished
    ? 'linear-gradient(90deg, #4ade80, #16a34a)' // Green gradient for finished
    : color
      ? `linear-gradient(90deg, ${color}, ${color})`
      : 'linear-gradient(90deg, #3b82f6, #2563eb)'; // Default blue gradient

  return (
    <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
      <div className={`h-4 rounded-full transition-all duration-500 ease-out`} style={{ width: `${clampedProgress}%`, background: gradient }}></div>
    </div>
  );
};

export default ProgressBar;