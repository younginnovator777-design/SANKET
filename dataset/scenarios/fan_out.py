"""
Scenario 2: Fan-Out / Structuring-Like generator.
One source/entity repeatedly creates transactions with many outputs or repeatedly splits
value across structured outputs.
"""
import random
from typing import List, Tuple

from dataset.generator.core import (
    GeneratedTransaction,
    TransactionLabel,
    EntityManager,
    SimulationClock,
    generate_txid,
    generate_event_id,
    sats_to_btc,
)


def generate_fan_out_scenario(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter_start: int,
    instance_id: int,
    max_txs: int = 2,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Generate a fan-out / structuring-like dispersion scenario.
    """
    actor = rng.choice(entity_mgr.anomalous_actors)
    entity_id = actor.entity_id
    scenario_instance_id = f"SCN_FANOUT_{instance_id:06d}"

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    num_txs = min(max_txs, rng.randint(1, 2))

    for i in range(num_txs):
        clock.tick(rng.uniform(1.0, 10.0))
        txid = generate_txid(seed, tx_counter_start + i)
        event_id = generate_event_id(seed, tx_counter_start + i)
        timestamp = clock.format_timestamp()

        # 1-2 source inputs
        input_addresses = [rng.choice(actor.addresses)]
        num_outputs = rng.randint(10, 30)

        # Structuring pattern: small uniform or near-uniform amounts just under round limits
        # e.g. 0.095 BTC = 9_500_000 sats, or 0.048 BTC = 4_800_000 sats
        base_chunk_sats = rng.choice([9_500_000, 4_800_000, 1_900_000, 950_000])
        out_sats_list = []
        for _ in range(num_outputs):
            # slight jitter +- 5%
            jitter = rng.randint(-base_chunk_sats // 20, base_chunk_sats // 20)
            out_sats_list.append(base_chunk_sats + jitter)

        fee_sats = rng.randint(20_000, 80_000)
        total_in_sats = sum(out_sats_list) + fee_sats

        # Destination addresses: diverse destination addresses
        output_addresses = [
            entity_mgr.get_fresh_address(actor.preferred_script_type)
            for _ in range(num_outputs)
        ]

        dst_ip, dst_port = entity_mgr.get_destination_peer()
        src_port = entity_mgr.get_ephemeral_port()

        tx = GeneratedTransaction(
            event_id=event_id,
            txid=txid,
            timestamp=timestamp,
            src_ip=actor.preferred_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            input_addresses=input_addresses,
            output_addresses=output_addresses,
            input_amounts=[sats_to_btc(total_in_sats)],
            output_amounts=[sats_to_btc(s) for s in out_sats_list],
            fee=sats_to_btc(fee_sats),
            script_type=actor.preferred_script_type,
            geo_country=actor.preferred_country,
            asn=actor.preferred_asn,
        )

        label = TransactionLabel(
            txid=txid,
            scenario="fan_out",
            entity_id=entity_id,
            scenario_instance_id=scenario_instance_id,
            is_benign=False,
            parent_txid="",
        )

        transactions.append(tx)
        labels.append(label)

    return transactions, labels
