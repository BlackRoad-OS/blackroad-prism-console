import PrismShell from '../../components/PrismShell';

export default function Desktop() {
  return (
    <div className="h-full flex flex-col gap-4">
      <h1 className="text-xl font-bold text-white">Prism Desktop</h1>
      <div className="flex-1 min-h-0">
        <PrismShell />
      </div>
    </div>
  );
}
