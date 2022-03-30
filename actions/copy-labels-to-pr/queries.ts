export const fetchLabelsOfPrAndReferencedIssues = `
query fetchLabelsOfPrAndReferencedIssues($prUrl: String!) {
  resource(url: $prUrl) {
    ... on PullRequest {
        labels(first: 100) {
          edges {
            node {
              name
            }
          }
        }
        closingIssuesReferences(first: 10) {
          nodes {
            labels(first: 100) {
              edges {
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export type LabelNodes = { edges: { node: { name: string } }[] };
export type FetchLabelsResponse = {
  resource: {
    labels: LabelNodes;
    closingIssuesReferences: { nodes: { labels: LabelNodes }[] };
  };
};
