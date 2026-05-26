export function generateSeededColor(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${hash % 360}, 50%, 50%)`;
}

export function getDirection(cursors) {
    if (cursors.left.isDown) return "W";
    if (cursors.right.isDown) return "E";
    if (cursors.up.isDown) return "N";
    if (cursors.down.isDown) return "S";
    return "Idle";
}
