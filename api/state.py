"""
In-Memory State Service for SANKET API.
Maintains the latest completed AnalysisResult, active GraphSnapshot, and canonical records
in memory to serve UI read endpoints without external databases or caches.
"""
from typing import Any, Dict, Optional
from src.graph.model import GraphSnapshot
from src.pipeline.orchestrator import AnalysisResult


class AnalysisStateManager:
    """Explicit in-memory singleton service managing active analysis state."""

    def __init__(self) -> None:
        self._latest_result: Optional[AnalysisResult] = None
        self._latest_graph: Optional[GraphSnapshot] = None
        self._canonical_records: Dict[str, Any] = {}

    def set_latest_analysis(
        self,
        result: AnalysisResult,
        graph: Optional[GraphSnapshot] = None,
        canonical_map: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Store the latest completed analysis result, graph snapshot, and canonical records."""
        self._latest_result = result
        self._latest_graph = graph
        self._canonical_records = dict(canonical_map) if canonical_map else {}

    def get_latest_result(self) -> Optional[AnalysisResult]:
        """Return the latest analysis result, or None if no analysis has been executed."""
        return self._latest_result

    def get_latest_graph(self) -> Optional[GraphSnapshot]:
        """Return the latest graph snapshot, or None if not available."""
        return self._latest_graph

    def get_canonical_record(self, txid: str) -> Optional[Dict[str, Any]]:
        """Return the canonical transaction dict for a given txid if available."""
        return self._canonical_records.get(txid)

    def clear(self) -> None:
        """Reset in-memory state (used for clean resets and testing)."""
        self._latest_result = None
        self._latest_graph = None
        self._canonical_records.clear()

    def has_analysis(self) -> bool:
        """Check if an analysis result exists in memory."""
        return self._latest_result is not None


# Global singleton service instance managed across API lifecycles
analysis_state = AnalysisStateManager()
