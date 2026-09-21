import { Button, Input, Select } from '@ai-engine/ui';
import { IfElseNodeConfigSchema, type ValueSelector } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { VariableSelector, variableOptionsForNode } from '../../variable-selector';
import { configWithDraft, formatConfigValue, PanelSection, StringField } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { ifElseDefaultConfig } from './default';

const operators = [
  'equals',
  'not-equals',
  'contains',
  'not-contains',
  'greater-than',
  'less-than',
  'is-empty',
  'is-not-empty',
] as const;

export const IfElseNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = IfElseNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft(IfElseNodeConfigSchema.parse(ifElseDefaultConfig), draft);
  const fallbackSelector: ValueSelector = variableOptionsForNode(node.id, nodes, edges, t)[0]
    ?.selector ?? ['sys', 'query'];
  const updateCase = (index: number, patch: Record<string, unknown>) =>
    setDraft({
      ...config,
      cases: config.cases.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    });
  const updateCondition = (
    caseIndex: number,
    conditionIndex: number,
    patch: Record<string, unknown>,
  ) => {
    const currentCase = config.cases[caseIndex];
    if (!currentCase) return;
    updateCase(caseIndex, {
      conditions: currentCase.conditions.map((condition, current) =>
        current === conditionIndex ? { ...condition, ...patch } : condition,
      ),
    });
  };
  return (
    <PanelSection title={t('panels.ifElse.title')} description={t('panels.ifElse.description')}>
      {config.cases.map((item, index) => {
        return (
          <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={`${index}`}>
            <StringField
              label={t('panels.ifElse.branchName')}
              value={item.branch}
              onChange={(branch) => updateCase(index, { branch })}
            />
            {item.conditions.length > 1 ? (
              <Select
                aria-label={t('panels.ifElse.relation', { branch: index + 1 })}
                value={item.logicalOperator}
                onChange={(event) => updateCase(index, { logicalOperator: event.target.value })}
              >
                <option value="and">{t('panels.ifElse.all')}</option>
                <option value="or">{t('panels.ifElse.any')}</option>
              </Select>
            ) : null}
            {item.conditions.map((condition, conditionIndex) => (
              <div
                className="border-border flex flex-col gap-2 rounded border p-2"
                key={`${index}:${conditionIndex}`}
              >
                <VariableSelector
                  label={t('panels.ifElse.left', { condition: conditionIndex + 1 })}
                  nodeId={node.id}
                  nodes={nodes}
                  edges={edges}
                  value={condition.left}
                  onChange={(left) => updateCondition(index, conditionIndex, { left })}
                />
                <Select
                  aria-label={t('panels.ifElse.operator', {
                    branch: index + 1,
                    condition: conditionIndex + 1,
                  })}
                  value={condition.operator}
                  onChange={(event) =>
                    updateCondition(index, conditionIndex, { operator: event.target.value })
                  }
                >
                  {operators.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </Select>
                {!['is-empty', 'is-not-empty'].includes(condition.operator) ? (
                  <>
                    <Select
                      aria-label={t('panels.ifElse.rightSource', {
                        branch: index + 1,
                        condition: conditionIndex + 1,
                      })}
                      value={condition.right?.source ?? 'constant'}
                      onChange={(event) =>
                        updateCondition(index, conditionIndex, {
                          right:
                            event.target.value === 'selector'
                              ? { source: 'selector', selector: fallbackSelector }
                              : { source: 'constant', value: '' },
                        })
                      }
                    >
                      <option value="constant">{t('panels.variableAssigner.constant')}</option>
                      <option value="selector">{t('panels.variableAssigner.reference')}</option>
                    </Select>
                    {condition.right?.source === 'selector' ? (
                      <VariableSelector
                        label={t('variables.right')}
                        nodeId={node.id}
                        nodes={nodes}
                        edges={edges}
                        value={condition.right.selector}
                        onChange={(selector) =>
                          updateCondition(index, conditionIndex, {
                            right: { source: 'selector', selector },
                          })
                        }
                      />
                    ) : (
                      <Input
                        aria-label={t('panels.ifElse.rightValue', {
                          branch: index + 1,
                          condition: conditionIndex + 1,
                        })}
                        value={
                          condition.right?.source === 'constant'
                            ? formatConfigValue(condition.right.value)
                            : ''
                        }
                        onChange={(event) =>
                          updateCondition(index, conditionIndex, {
                            right: { source: 'constant', value: event.target.value },
                          })
                        }
                      />
                    )}
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.conditions.length === 1}
                  onClick={() =>
                    updateCase(index, {
                      conditions: item.conditions.filter(
                        (_, current) => current !== conditionIndex,
                      ),
                    })
                  }
                >
                  {t('panels.ifElse.deleteCondition')}
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateCase(index, {
                  conditions: [
                    ...item.conditions,
                    {
                      left: fallbackSelector,
                      operator: 'is-not-empty',
                    },
                  ],
                })
              }
            >
              {t('panels.ifElse.addCondition')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={config.cases.length === 1}
              onClick={() =>
                setDraft({
                  ...config,
                  cases: config.cases.filter((_, current) => current !== index),
                })
              }
            >
              {t('panels.ifElse.deleteBranch')}
            </Button>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setDraft({
            ...config,
            cases: [
              ...config.cases,
              {
                branch: `case_${config.cases.length + 1}`,
                logicalOperator: 'and',
                conditions: [
                  {
                    left: fallbackSelector,
                    operator: 'is-not-empty',
                  },
                ],
              },
            ],
          })
        }
      >
        {t('panels.ifElse.addBranch')}
      </Button>
      <StringField
        label={t('panels.ifElse.defaultBranch')}
        value={config.defaultBranch}
        onChange={(defaultBranch) => setDraft({ ...config, defaultBranch })}
      />
    </PanelSection>
  );
};
