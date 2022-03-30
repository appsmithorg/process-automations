"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLabelsOfPrAndReferencedIssues = void 0;
exports.fetchLabelsOfPrAndReferencedIssues = `
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
