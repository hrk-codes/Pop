interface MonitoringSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function MonitoringSwitch({ checked, onChange }: MonitoringSwitchProps) {
  return (
    <label className="monitoring-switch" title="Toggle monitoring">
      <input
        aria-label="Monitoring"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="monitoring-switch__track">
        <span className="monitoring-switch__thumb" />
      </span>
    </label>
  );
}
