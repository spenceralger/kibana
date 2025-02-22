/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { ALERT_STATUS_ACTIVE, ALERT_STATUS_RECOVERED } from '@kbn/rule-data-utils';
import { ALERT_STATUS_ALL } from './constants';

export type Maybe<T> = T | null | undefined;

export const alertWorkflowStatusRt = t.keyof({
  open: null,
  acknowledged: null,
  closed: null,
});
export type AlertWorkflowStatus = t.TypeOf<typeof alertWorkflowStatusRt>;

export interface ApmIndicesConfig {
  sourcemap: string;
  error: string;
  onboarding: string;
  span: string;
  transaction: string;
  metric: string;
  apmAgentConfigurationIndex: string;
  apmCustomLinkIndex: string;
}

export type AlertStatus =
  | typeof ALERT_STATUS_ACTIVE
  | typeof ALERT_STATUS_RECOVERED
  | typeof ALERT_STATUS_ALL;

export interface AlertStatusFilter {
  status: AlertStatus;
  query: string;
  label: string;
}
