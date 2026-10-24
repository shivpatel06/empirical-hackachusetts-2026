"use client";
import type { ChecklistDraft } from "../lib/schemas/ai";
type Rule = ChecklistDraft["rules"][number];
type Policy = NonNullable<Rule["assessment"]>["conditions"][number];
/** The coordinator sees and edits the same expression that the evaluator uses. */
export function CriterionExpression({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange?: (rule: Rule) => void;
}) {
  const nodes = new Map(rule.expression.nodes.map((n) => [n.id, n]));
  const updateNode = (
    id: string,
    change: Partial<Rule["expression"]["nodes"][number]>,
  ) =>
    onChange?.({
      ...rule,
      expression: {
        ...rule.expression,
        nodes: rule.expression.nodes.map((n) =>
          n.id === id ? { ...n, ...change } : n,
        ),
      },
    });
  const updatePolicy = (id: string, change: Partial<Policy>) =>
    onChange?.({
      ...rule,
      assessment: {
        semantics: "qualification",
        conditions: rule.assessment!.conditions.map((p) =>
          p.nodeId === id ? { ...p, ...change } : p,
        ),
      },
    });
  const render = (id: string): React.ReactNode => {
    const node = nodes.get(id)!;
    if (node.operator !== "condition")
      return (
        <div className="expression-group" key={id}>
          {onChange ? (
            <label className="field-label">
              How these conditions combine
              <select
                value={node.operator}
                onChange={(e) =>
                  updateNode(id, { operator: e.target.value as "all" | "any" })
                }
              >
                <option value="all">All conditions required (AND)</option>
                <option value="any">At least one alternative (OR)</option>
              </select>
            </label>
          ) : (
            <strong>
              {node.operator === "all"
                ? "All conditions required (AND)"
                : "At least one alternative (OR)"}
            </strong>
          )}
          {node.childIds.map(render)}
        </div>
      );
    const policy = rule.assessment?.conditions.find((p) => p.nodeId === id);
    return (
      <div className="atomic-condition" key={id}>
        {onChange ? (
          <label className="field-label">
            Qualifying condition
            <textarea
              value={node.condition ?? ""}
              onChange={(e) => updateNode(id, { condition: e.target.value })}
            />
          </label>
        ) : (
          <p>{node.condition}</p>
        )}
        {policy && (
          <>
            <small>Original source: {policy.sourceQuote}</small>
            {onChange && (
              <label className="field-label">
                Evidence check
                <select
                  value={policy.numeric ? "numeric" : "interpretation"}
                  onChange={(e) =>
                    updatePolicy(id, {
                      numeric:
                        e.target.value === "numeric"
                          ? {
                              analyte: "",
                              operator: ">=",
                              value: 0,
                              unit: "",
                              usesReferenceUpper: false,
                            }
                          : null,
                    })
                  }
                >
                  <option value="interpretation">
                    Coordinator interpretation required
                  </option>
                  <option value="numeric">Structured measurement</option>
                </select>
              </label>
            )}
            {policy.numeric &&
              (onChange ? (
                <div className="policy-fields">
                  <label className="field-label">
                    Measurement name
                    <input
                      value={policy.numeric.analyte}
                      onChange={(e) =>
                        updatePolicy(id, {
                          numeric: {
                            ...policy.numeric!,
                            analyte: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Comparison
                    <select
                      value={policy.numeric.operator}
                      onChange={(e) =>
                        updatePolicy(id, {
                          numeric: {
                            ...policy.numeric!,
                            operator: e.target.value as NonNullable<
                              Policy["numeric"]
                            >["operator"],
                          },
                        })
                      }
                    >
                      {[">", ">=", "<", "<=", "="].map((op) => (
                        <option key={op}>{op}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Threshold
                    <input
                      type="number"
                      step="any"
                      value={policy.numeric.value}
                      onChange={(e) =>
                        updatePolicy(id, {
                          numeric: {
                            ...policy.numeric!,
                            value: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Unit
                    <input
                      value={policy.numeric.unit}
                      onChange={(e) =>
                        updatePolicy(id, {
                          numeric: { ...policy.numeric!, unit: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={policy.numeric.usesReferenceUpper}
                      onChange={(e) =>
                        updatePolicy(id, {
                          numeric: {
                            ...policy.numeric!,
                            usesReferenceUpper: e.target.checked,
                          },
                        })
                      }
                    />
                    Multiply threshold by the laboratory upper reference limit
                  </label>
                </div>
              ) : (
                <p className="measurement">
                  {policy.numeric.analyte} {policy.numeric.operator}{" "}
                  {policy.numeric.value}
                  {policy.numeric.usesReferenceUpper
                    ? " × upper reference limit"
                    : ""}{" "}
                  {policy.numeric.unit}
                </p>
              ))}
            {!policy.numeric && (
              <p className="support-note">
                Requires coordinator interpretation; quoted text alone cannot
                satisfy this condition.
              </p>
            )}
            {onChange ? (
              <>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={Boolean(policy.temporal)}
                    onChange={(e) =>
                      updatePolicy(id, {
                        temporal: e.target.checked
                          ? { maxAgeDays: 28, anchor: "assessment" }
                          : null,
                      })
                    }
                  />
                  Observation time window
                </label>
                {policy.temporal && (
                  <div className="policy-fields">
                    <label className="field-label">
                      Maximum age in days
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={policy.temporal.maxAgeDays}
                        onChange={(e) =>
                          updatePolicy(id, {
                            temporal: {
                              ...policy.temporal!,
                              maxAgeDays: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Window measured from
                      <input
                        value={policy.temporal.anchor}
                        onChange={(e) =>
                          updatePolicy(id, {
                            temporal: {
                              ...policy.temporal!,
                              anchor: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </>
            ) : policy.temporal ? (
              <p>
                Within {policy.temporal.maxAgeDays} days of{" "}
                {policy.temporal.anchor}.
              </p>
            ) : (
              <small>No time window specified.</small>
            )}
            {policy.temporal && policy.temporal.anchor !== "assessment" && (
              <p className="support-note">
                This event date is not available. Screening will request review.
              </p>
            )}
          </>
        )}
      </div>
    );
  };
  return (
    <section className="expression-review" aria-label="Qualification logic">
      <span className="eyebrow">QUALIFICATION LOGIC</span>
      <p>
        {rule.polarity === "exclusion"
          ? "These conditions describe avoiding the source exclusion."
          : "These conditions describe satisfying the inclusion criterion."}{" "}
        Review each alternative, threshold and exception against the source.
      </p>
      {render(rule.expression.rootId)}
      {!rule.assessment && (
        <small>
          Historical paragraph checklist. Automated evidence support is limited
          to the unchanged demo rules.
        </small>
      )}
    </section>
  );
}
