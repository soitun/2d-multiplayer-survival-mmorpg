// Unified API Performance Report Service
// Combines performance data from OpenAI (GPT-4o & Whisper) and Kokoro TTS

import { openaiService, type OpenAIPerformanceReport } from './openaiService';
import whisperService, { type WhisperPerformanceReport } from './whisperService';
import { kokoroService, type KokoroPerformanceReport } from './kokoroService';

export interface UnifiedAPIPerformanceReport {
  generatedAt: string;
  services: {
    openai: OpenAIPerformanceReport;
    whisper: WhisperPerformanceReport;
    kokoro: KokoroPerformanceReport;
  };
  summary: {
    totalAPICalls: number;
    totalSuccessfulCalls: number;
    totalFailedCalls: number;
    overallSuccessRate: number;
    averageLatencyMs: number;
  };
}

class APIPerformanceService {
  /**
   * Generate unified performance report from all API services
   */
  generateUnifiedReport(): UnifiedAPIPerformanceReport {
    const openaiReport = openaiService.generatePerformanceReport();
    const whisperReport = whisperService.generatePerformanceReport();
    const kokoroReport = kokoroService.generatePerformanceReport();

    const totalCalls = openaiReport.totalRequests + whisperReport.totalRequests + kokoroReport.totalRequests;
    const totalSuccessful = openaiReport.successfulRequests + whisperReport.successfulRequests + kokoroReport.successfulRequests;
    const totalFailed = openaiReport.failedRequests + whisperReport.failedRequests + kokoroReport.failedRequests;

    // Calculate weighted average latency
    const totalLatency = 
      (openaiReport.averageLatencyMs * openaiReport.totalRequests) +
      (whisperReport.averageLatencyMs * whisperReport.totalRequests) +
      (kokoroReport.averageLatencyMs * kokoroReport.totalRequests);
    const averageLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;

    return {
      generatedAt: new Date().toISOString(),
      services: {
        openai: openaiReport,
        whisper: whisperReport,
        kokoro: kokoroReport,
      },
      summary: {
        totalAPICalls: totalCalls,
        totalSuccessfulCalls: totalSuccessful,
        totalFailedCalls: totalFailed,
        overallSuccessRate: totalCalls > 0 ? (totalSuccessful / totalCalls) * 100 : 0,
        averageLatencyMs: averageLatency,
      },
    };
  }

  /**
   * Generate formatted text report for display/copying
   */
  generateFormattedReport(): string {
    const report = this.generateUnifiedReport();
    
    const formatNumber = (num: number, decimals: number = 2) => num.toFixed(decimals);
    const formatPercent = (num: number) => `${formatNumber(num, 1)}%`;
    const formatTime = (ms: number) => `${formatNumber(ms)}ms`;

    let output = '╔════════════════════════════════════════════════════════════════╗\n';
    output += '║        SOVA API PERFORMANCE REPORT (Unified)                    ║\n';
    output += '╚════════════════════════════════════════════════════════════════╝\n\n';
    
    output += `Generated: ${new Date(report.generatedAt).toLocaleString()}\n`;
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    // Summary Section
    output += '📊 OVERALL SUMMARY\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    output += `Total API Calls:        ${report.summary.totalAPICalls}\n`;
    output += `Successful Calls:       ${report.summary.totalSuccessfulCalls}\n`;
    output += `Failed Calls:           ${report.summary.totalFailedCalls}\n`;
    output += `Success Rate:           ${formatPercent(report.summary.overallSuccessRate)}\n`;
    output += `Average Latency:        ${formatTime(report.summary.averageLatencyMs)}\n`;
    output += '\n';

    // OpenAI GPT-4o Chat Section
    output += '🤖 OPENAI GPT-4O (Chat Responses via Secure Proxy)\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    if (report.services.openai.totalRequests === 0) {
      output += 'No requests recorded yet.\n';
    } else {
      output += `Total Requests:          ${report.services.openai.totalRequests}\n`;
      output += `Successful:              ${report.services.openai.successfulRequests}\n`;
      output += `Failed:                  ${report.services.openai.failedRequests}\n`;
      output += `Avg Latency:             ${formatTime(report.services.openai.averageLatencyMs)}\n`;
      output += `Median Latency:          ${formatTime(report.services.openai.medianLatencyMs)}\n`;
      output += `Min Latency:             ${formatTime(report.services.openai.minLatencyMs)}\n`;
      output += `Max Latency:             ${formatTime(report.services.openai.maxLatencyMs)}\n`;
      output += `Avg Prompt Length:       ${formatNumber(report.services.openai.averagePromptLength)} chars\n`;
      output += `Avg Response Length:     ${formatNumber(report.services.openai.averageResponseLength)} chars\n`;
      output += `Avg Throughput:          ${formatNumber(report.services.openai.averageThroughputCharsPerSecond)} chars/sec\n`;
    }
    output += '\n';

    // Whisper STT Section
    output += '🎙️ OPENAI WHISPER (Speech-to-Text via Secure Proxy)\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    if (report.services.whisper.totalRequests === 0) {
      output += 'No requests recorded yet.\n';
    } else {
      output += `Total Requests:          ${report.services.whisper.totalRequests}\n`;
      output += `Successful:              ${report.services.whisper.successfulRequests}\n`;
      output += `Failed:                  ${report.services.whisper.failedRequests}\n`;
      output += `Avg Latency:             ${formatTime(report.services.whisper.averageLatencyMs)}\n`;
      output += `Median Latency:          ${formatTime(report.services.whisper.medianLatencyMs)}\n`;
      output += `Min Latency:             ${formatTime(report.services.whisper.minLatencyMs)}\n`;
      output += `Max Latency:             ${formatTime(report.services.whisper.maxLatencyMs)}\n`;
      output += `Avg Audio Size:          ${formatNumber(report.services.whisper.averageAudioSizeKB)} KB\n`;
      output += `Avg Text Length:         ${formatNumber(report.services.whisper.averageTextLength)} chars\n`;
      output += `Avg Throughput:          ${formatNumber(report.services.whisper.averageThroughputCharsPerSecond)} chars/sec\n`;
    }
    output += '\n';

    // Kokoro TTS Section
    output += '🎤 KOKORO TTS (Text-to-Speech - Local Backend)\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    if (report.services.kokoro.totalRequests === 0) {
      output += 'No requests recorded yet.\n';
    } else {
      output += `Total Requests:          ${report.services.kokoro.totalRequests}\n`;
      output += `Successful:              ${report.services.kokoro.successfulRequests}\n`;
      output += `Failed:                  ${report.services.kokoro.failedRequests}\n`;
      output += `Avg Latency:             ${formatTime(report.services.kokoro.averageLatencyMs)}\n`;
      output += `Median Latency:          ${formatTime(report.services.kokoro.medianLatencyMs)}\n`;
      output += `Min Latency:             ${formatTime(report.services.kokoro.minLatencyMs)}\n`;
      output += `Max Latency:             ${formatTime(report.services.kokoro.maxLatencyMs)}\n`;
      output += `Avg Text Length:         ${formatNumber(report.services.kokoro.averageTextLength)} chars\n`;
      output += `Avg Audio Size:          ${formatNumber(report.services.kokoro.averageAudioSizeKB)} KB\n`;
      output += `Avg Throughput:          ${formatNumber(report.services.kokoro.averageThroughputCharsPerSecond)} chars/sec\n`;
    }
    output += '\n';

    output += '╔════════════════════════════════════════════════════════════════╗\n';
    output += '║  End of Report                                                 ║\n';
    output += '╚════════════════════════════════════════════════════════════════╝\n';

    return output;
  }

  /**
   * Clear all performance data from all services
   */
  clearAllPerformanceData() {
    openaiService.clearPerformanceData();
    whisperService.clearPerformanceData();
    kokoroService.clearPerformanceData();
    console.log('[APIPerformance] All performance data cleared');
  }
}

// Export singleton instance
export const apiPerformanceService = new APIPerformanceService();
export default apiPerformanceService;

