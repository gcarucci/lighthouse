/**
 * @license Copyright 2019 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('../audit.js');
const i18n = require('../../lib/i18n/i18n.js');
const ComputedLcp = require('../../computed/metrics/largest-contentful-paint.js');
const LHError = require('../../lib/lh-error.js');

const UIStrings = {
  /** Description of the Largest Contentful Paint (LCP) metric, which marks the time at which the largest text or image is painted by the browser. This is displayed within a tooltip when the user hovers on the metric name to see more. No character length limits. 'Learn More' becomes link text to additional documentation. */
  description: 'Largest Contentful Paint marks the time at which the largest text or image is ' +
      `painted. [Learn More](https://web.dev/lighthouse-largest-contentful-paint/)`,
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

class LargestContentfulPaint extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'largest-contentful-paint',
      title: str_(i18n.UIStrings.largestContentfulPaintMetric),
      description: str_(UIStrings.description),
      scoreDisplayMode: Audit.SCORING_MODES.NUMERIC,
      requiredArtifacts: ['HostUserAgent', 'traces', 'devtoolsLogs', 'TestedAsMobileDevice'],
    };
  }

  /**
   * @return {{mobile: {scoring: LH.Audit.ScoreOptions}, desktop: {scoring: LH.Audit.ScoreOptions}}}
   */
  static get defaultOptions() {
    return {
      mobile: {
        // 25th and 13th percentiles HTTPArchive -> median and p10 points.
        // https://bigquery.cloud.google.com/table/httparchive:lighthouse.2020_02_01_mobile?pli=1
        // https://web.dev/lcp/#what-is-a-good-lcp-score
        // see https://www.desmos.com/calculator/1etesp32kt
        scoring: {
          p10: 2500,
          median: 4000,
        },
      },
      desktop: {
        // 25th and 5th percentiles HTTPArchive -> median and p10 points.
        // SELECT
        //   APPROX_QUANTILES(lcpValue, 100)[OFFSET(5)] AS p05_lcp,
        //   APPROX_QUANTILES(lcpValue, 100)[OFFSET(25)] AS p25_lcp
        // FROM (
        //   SELECT CAST(JSON_EXTRACT_SCALAR(payload, "$['_chromeUserTiming.LargestContentfulPaint']") AS NUMERIC) AS lcpValue
        //   FROM `httparchive.pages.2020_04_01_desktop`
        // )
        scoring: {
          p10: 1200,
          median: 2400,
        },
      },
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts, context) {
    const trace = artifacts.traces[Audit.DEFAULT_PASS];
    const devtoolsLog = artifacts.devtoolsLogs[Audit.DEFAULT_PASS];
    const metricComputationData = {trace, devtoolsLog, settings: context.settings};

    let metricResult;
    try {
      metricResult = await ComputedLcp.request(metricComputationData, context);
    } catch (err) {
      const match = artifacts.HostUserAgent.match(/Chrome\/(\d+)/);
      if (!match) throw err;
      const milestone = Number(match[1]);

      // m79 is the minimum version which supports LCP
      // https://chromium.googlesource.com/chromium/src/+/master/docs/speed/metrics_changelog/lcp.md
      if (milestone < 79 && err.code === 'NO_LCP') {
        throw new LHError(
          LHError.errors.UNSUPPORTED_OLD_CHROME,
          {featureName: 'Largest Contentful Paint'}
        );
      }
      throw err;
    }

    const isDesktop = artifacts.TestedAsMobileDevice === false;
    const options = isDesktop ? context.options.desktop : context.options.mobile;

    return {
      score: Audit.computeLogNormalScore(
        options.scoring,
        metricResult.timing
      ),
      numericValue: metricResult.timing,
      numericUnit: 'millisecond',
      displayValue: str_(i18n.UIStrings.seconds, {timeInMs: metricResult.timing}),
    };
  }
}

module.exports = LargestContentfulPaint;
module.exports.UIStrings = UIStrings;
