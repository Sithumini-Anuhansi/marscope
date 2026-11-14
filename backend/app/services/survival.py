from datetime import datetime

def estimate_endurance(amount: float, unit: str, reserve_amount: float, samples: list[dict]) -> dict:
    """Infer a rate only from at least two measured consumption events."""
    def timestamp(sample):
        value=sample['recorded_at']
        return datetime.fromisoformat(value) if isinstance(value,str) else value
    ordered = sorted(samples, key=timestamp)
    if len(ordered) < 2:
        return {'days_remaining': None, 'rate_per_day': None, 'confidence': 'insufficient-data',
                'assumption': 'At least two timestamped consumption records are required; no default human consumption rate is used.'}
    elapsed_days = (timestamp(ordered[-1]) - timestamp(ordered[0])).total_seconds() / 86400
    if elapsed_days <= 0:
        return {'days_remaining': None, 'rate_per_day': None, 'confidence': 'insufficient-data',
                'assumption': 'Consumption timestamps must span a positive interval.'}
    # Treat each event after the first as consumption over the interval since the prior event.
    consumed = sum(sample['amount'] for sample in ordered[1:])
    rate = consumed / elapsed_days
    usable = max(0, amount - reserve_amount)
    return {'days_remaining': usable / rate if rate > 0 else None, 'rate_per_day': rate,
            'confidence': 'low' if len(ordered) < 4 else 'moderate',
            'assumption': f'Linear projection from {len(ordered)} timestamped consumption events across {elapsed_days:.2f} days; each event after the first is treated as consumption since the previous event. Assumes the measured average continues and reserve is unavailable for planned use.'}
