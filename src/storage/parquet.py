import pyarrow as pa
import pyarrow.parquet as pq
from typing import List
from src.contract.models import CanonicalTransaction

def save_canonical_to_parquet(records: List[CanonicalTransaction], output_path: str):
    data = [r.model_dump(mode='json') for r in records]
    table = pa.Table.from_pylist(data)
    pq.write_table(table, output_path)
