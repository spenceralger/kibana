/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import expect from '@kbn/expect';

import { FtrProviderContext } from '../../ftr_provider_context';

// https://www.elastic.co/guide/en/kibana/current/tutorial-load-dataset.html

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const log = getService('log');
  const retry = getService('retry');
  const security = getService('security');
  const config = getService('config');
  const browser = getService('browser');
  const kibanaServer = getService('kibanaServer');
  const PageObjects = getPageObjects([
    'console',
    'common',
    'settings',
    'visualize',
    'visEditor',
    'visChart',
  ]);

  const xyChartSelector = 'xyVisChart';
  const remoteName = 'ftr-remote:';
  const indexPatternString = 'shakespeare';
  const indexPattern = config.get('esTestCluster.ccs')
    ? remoteName + indexPatternString
    : indexPatternString;

  // https://www.elastic.co/guide/en/kibana/current/tutorial-load-dataset.html

  describe('Shakespeare', function describeIndexTests() {
    // index starts on the first "count" metric at 1
    // Each new metric or aggregation added to a visualization gets the next index.
    // So to modify a metric or aggregation tests need to keep track of the
    // order they are added.
    let aggIndex = 1;
    // Used to track flag before and after reset
    let isNewChartsLibraryEnabled = true;

    before(async function () {
      log.debug('https://www.elastic.co/guide/en/kibana/current/tutorial-load-dataset.html');
      isNewChartsLibraryEnabled = await PageObjects.visChart.isNewChartsLibraryEnabled();
      await security.testUser.setRoles(['kibana_admin', 'test_shakespeare_reader']);
      await kibanaServer.savedObjects.cleanStandardList();
      log.debug('Load shakespeare data');

      if (!isNewChartsLibraryEnabled) {
        await kibanaServer.uiSettings.update({
          'visualization:visualize:legacyPieChartsLibrary': true,
        });
        await browser.refresh();
      }
    });

    after(async () => {
      await security.testUser.restoreDefaults();
      kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.uiSettings.replace({});
    });

    it('should create shakespeare index pattern', async function () {
      await PageObjects.common.navigateToApp('settings');
      log.debug('Create shakespeare index pattern');
      await PageObjects.settings.createIndexPattern(indexPattern, null);
      const patternName = await PageObjects.settings.getIndexPageHeading();
      expect(patternName).to.be(indexPattern);
    });

    // https://www.elastic.co/guide/en/kibana/current/tutorial-visualizing.html
    /* 1. Click New and select Vertical bar chart.
    2. Select the shakes* index pattern. Since you haven’t defined any buckets
    yet, you’ll see a single big bar that shows the total count of documents that
    match the default wildcard query.
    */
    it('should create initial vertical bar chart', async function () {
      log.debug('create shakespeare vertical bar chart');
      await PageObjects.visualize.navigateToNewAggBasedVisualization();
      await PageObjects.visualize.clickVerticalBarChart();
      await PageObjects.visualize.clickNewSearch(indexPattern);
      await PageObjects.visChart.waitForVisualization();

      // Remove refresh click when vislib is removed
      // https://github.com/elastic/kibana/issues/56143
      await PageObjects.visualize.clickRefresh(true);

      const expectedChartValues = [111396];
      await retry.try(async () => {
        const data = await PageObjects.visChart.getBarChartData(xyChartSelector, 'Count');
        log.debug('data=' + data);
        log.debug('data.length=' + data.length);
        expect(data[0] - expectedChartValues[0]).to.be.lessThan(5);
      });
    });

    /* 3. To show the number of speaking parts per play along the y-axis, you need
    to configure the Y-axis metric aggregation. A metric aggregation computes
    metrics based on values extracted from the search results. To get the
    number of speaking parts per play, select the Unique Count aggregation
    and choose speaker from the field list. You can also give the axis a
    custom label, Speaking Parts.
    */
    it('should configure metric Unique Count Speaking Parts', async function () {
      log.debug('Metric = Unique Count, speaker, Speaking Parts');
      // this first change to the YAxis metric agg uses the default aggIndex of 1
      await PageObjects.visEditor.selectYAxisAggregation(
        'Unique Count',
        'speaker',
        'Speaking Parts'
      );
      // then increment the aggIndex for the next one we create
      aggIndex = aggIndex + 1;
      await PageObjects.visEditor.clickGo();
      const expectedChartValues = [935];
      await retry.try(async () => {
        const data = await PageObjects.visChart.getBarChartData(xyChartSelector, 'Speaking Parts');
        log.debug('data=' + data);
        log.debug('data.length=' + data.length);
        expect(data).to.eql(expectedChartValues);
      });
      const title = await PageObjects.visChart.getYAxisTitle(xyChartSelector);
      expect(title).to.be('Speaking Parts');
    });

    /* 4. To show the different plays long the x-axis, select the X-Axis buckets
    type, select Terms from the aggregation list, and choose play_name from the
    field list. To list them alphabetically, select Ascending order. You can
    also give the axis a custom label, Play Name.
    5. Click Apply changes images/apply-changes-button.png to view the results.
    */
    it('should configure Terms aggregation on play_name', async function () {
      await PageObjects.visEditor.clickBucket('X-axis');
      log.debug('Aggregation = Terms');
      await PageObjects.visEditor.selectAggregation('Terms');
      aggIndex = aggIndex + 1;
      log.debug('Field = play_name');
      await PageObjects.visEditor.selectField('play_name');
      await PageObjects.visEditor.clickGo();

      const expectedChartValues = [71, 65, 62, 55, 55];
      await retry.try(async () => {
        const data = await PageObjects.visChart.getBarChartData(xyChartSelector, 'Speaking Parts');
        log.debug('data=' + data);
        log.debug('data.length=' + data.length);
        expect(data).to.eql(expectedChartValues);
      });

      const labels = await PageObjects.visChart.getXAxisLabels(xyChartSelector);
      expect(labels).to.eql([
        'Richard III',
        'Henry VI Part 2',
        'Coriolanus',
        'Antony and Cleopatra',
        'Timon of Athens',
      ]);
    });

    /* Now that you have a list of the smallest casts for Shakespeare plays, you
    might also be curious to see which of these plays makes the greatest demands
    on an individual actor by showing the maximum number of speeches for a
    given part.

    1. Click Add metrics to add a Y-axis aggregation.
    2. Choose the Max aggregation and select the speech_number field.
    */
    it('should configure Max aggregation metric on speech_number', async function () {
      await PageObjects.visEditor.clickBucket('Y-axis', 'metrics');
      log.debug('Aggregation = Max');
      await PageObjects.visEditor.selectYAxisAggregation(
        'Max',
        'speech_number',
        'Max Speaking Parts',
        aggIndex
      );
      await PageObjects.visEditor.clickGo();

      const expectedChartValues = [71, 65, 62, 55, 55];
      const expectedChartValues2 = [177, 106, 153, 132, 162];
      await retry.try(async () => {
        const data = await PageObjects.visChart.getBarChartData(xyChartSelector, 'Speaking Parts');
        const data2 = await PageObjects.visChart.getBarChartData(
          xyChartSelector,
          'Max Speaking Parts'
        );
        log.debug('data=' + data);
        log.debug('data.length=' + data.length);
        log.debug('data2=' + data2);
        log.debug('data2.length=' + data2.length);
        expect(data).to.eql(expectedChartValues);
        expect(data2).to.eql(expectedChartValues2);
      });

      const labels = await PageObjects.visChart.getXAxisLabels(xyChartSelector);
      expect(labels).to.eql([
        'Richard III',
        'Henry VI Part 2',
        'Coriolanus',
        'Antony and Cleopatra',
        'Timon of Athens',
      ]);
    });

    /* Continued from above.

    3. Click Options and change the Bar Mode to grouped.
    4. Click Apply changes images/apply-changes-button.png. Your chart should now look like this:
    */
    it('should configure change options to normal bars', async function () {
      await PageObjects.visEditor.clickMetricsAndAxes();
      await PageObjects.visEditor.selectChartMode('normal');
      await PageObjects.visEditor.clickGo();

      const expectedChartValues = [71, 65, 62, 55, 55];
      const expectedChartValues2 = [177, 106, 153, 132, 162];
      await retry.try(async () => {
        const data = await PageObjects.visChart.getBarChartData(xyChartSelector, 'Speaking Parts');
        const data2 = await PageObjects.visChart.getBarChartData(
          xyChartSelector,
          'Max Speaking Parts'
        );
        log.debug('data=' + data);
        log.debug('data.length=' + data.length);
        log.debug('data2=' + data2);
        log.debug('data2.length=' + data2.length);
        expect(data).to.eql(expectedChartValues);
        expect(data2).to.eql(expectedChartValues2);
      });
    });

    /* Note how the Number of speaking parts Y-axis starts at zero, but the bars
     don’t begin to differentiate until 18. To make the differences stand out,
     starting the Y-axis at a value closer to the minimum, go to Options and
     select Scale Y-Axis to data bounds.

    Save this chart with the name Bar Example.
    */
    it('should change the Y-Axis extents', async function () {
      await PageObjects.visEditor.setAxisExtents('50', '250');
      await PageObjects.visEditor.clickGo();

      // same values as previous test except scaled down by the 50 for Y-Axis min
      const expectedChartValues = [71, 65, 62, 55, 55];
      const expectedChartValues2 = [177, 106, 153, 132, 162];
      await retry.try(async () => {
        const data = await PageObjects.visChart.getBarChartData(xyChartSelector, 'Speaking Parts');
        const data2 = await PageObjects.visChart.getBarChartData(
          xyChartSelector,
          'Max Speaking Parts'
        );
        log.debug('data=' + data);
        log.debug('data.length=' + data.length);
        log.debug('data2=' + data2);
        log.debug('data2.length=' + data2.length);
        expect(data).to.eql(expectedChartValues);
        expect(data2).to.eql(expectedChartValues2);
      });
    });
  });
}
