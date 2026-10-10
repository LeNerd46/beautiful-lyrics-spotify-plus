export function sheetDragOffset(travelDp: number): number {
    'worklet';
    return travelDp >= 0 ? travelDp : -Math.min(24, Math.sqrt(-travelDp) * 2);
}

export function shouldDismissSheet(offsetDp: number, velocityDp: number, heightDp: number): boolean {
    'worklet';
    return offsetDp >= Math.max(120, heightDp * 0.22) || (offsetDp > 24 && velocityDp > 900);
}
