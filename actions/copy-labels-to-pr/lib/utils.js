"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMissingLabels = void 0;
const getMissingLabels = (prLabels, issueLabels) => {
    const existingLabels = new Set();
    for (const label of prLabels.edges) {
        existingLabels.add(label.node.name);
    }
    const labelsToSet = new Set();
    for (const node of issueLabels.nodes) {
        for (const edge of node.labels.edges) {
            if (!existingLabels.has(edge.node.name)) {
                labelsToSet.add(edge.node.name);
            }
        }
    }
    return Array.from(labelsToSet);
};
exports.getMissingLabels = getMissingLabels;
