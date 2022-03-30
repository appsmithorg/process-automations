import { LabelNodes } from "./queries";

export const getMissingLabels = (
  prLabels: LabelNodes,
  issueLabels: { nodes: { labels: LabelNodes }[] },
): string[] => {
  const existingLabels = new Set<string>();
  for (const label of prLabels.edges) {
    existingLabels.add(label.node.name);
  }

  const labelsToSet = new Set<string>();

  for (const node of issueLabels.nodes) {
    for (const edge of node.labels.edges) {
      if (!existingLabels.has(edge.node.name)) {
        labelsToSet.add(edge.node.name);
      }
    }
  }

  return Array.from(labelsToSet);
};
