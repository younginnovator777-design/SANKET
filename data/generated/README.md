# Generated Telemetry & Labels Directory

This directory holds synthetic Bitcoin telemetry files and evaluation ground-truth labels produced by `dataset.generate`.

## File Structure

```
data/generated/
    transactions.csv    # Raw telemetry in CSV format (canonical schema)
    transactions.json   # Raw telemetry in JSON format (optional)
    transactions.xml    # Raw telemetry in XML format (optional)
    labels.csv          # Evaluation ground-truth labels (ISOLATED)
```

## Critical Operational Rules

1. **Transaction Files (`transactions.csv`, `transactions.json`, `transactions.xml`)**:
   - Contain strictly unlabelled canonical transaction telemetry.
   - Do **NOT** contain scenario labels, entity types, or ground-truth classifications.
   - Safe for consumption by ingestion pipelines, ML feature extractors, and graph builders.

2. **Ground-Truth Labels (`labels.csv`)**:
   - Contains: `txid`, `scenario`, `entity_id`, `scenario_instance_id`, `is_benign`, `parent_txid`.
   - **MUST NEVER BE CONSUMED BY ML PIPELINES OR INFERENCE ENGINES**.
   - Reserved strictly for post-inference evaluation metrics (Precision, Recall, ROC-AUC, PR-AUC, False Positive Analysis).

3. **Reproducibility**:
   - Re-running `python -m dataset.generate --rows N --seed S` with the same parameters will overwrite files in this directory with identical, deterministic content.
