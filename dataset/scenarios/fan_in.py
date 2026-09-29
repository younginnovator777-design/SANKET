"""
Scenario 1: Fan-In consolidation generator.
Many disparate input addresses contribute to a transaction or short sequence
leading to a common output/entity.
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


def generate_fan_in_scenario(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter_start: int,
    instance_id: int,
    max_txs: int = 1,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Generate a fan-in consolidation scenario where many addresses funnel into a target output.
    """
    actor = rng.choice(entity_mgr.anomalous_actors)
    entity_id = actor.entity_id
    scenario_instance_id = f"SCN_FANIN_{instance_id:06d}"

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    # Target consolidation destination address
    target_addr = rng.choice(actor.addresses)
    num_txs = min(max_txs, rng.randint(1, 2))

    for i in range(num_txs):
        clock.tick(rng.uniform(0.5, 4.0))  # rapid successive observations
        txid = generate_txid(seed, tx_counter_start + i)
        event_id = generate_event_id(seed, tx_counter_start + i)
        timestamp = clock.format_timestamp()

        # Fan-in has 8 to 28 input addresses
        num_inputs = rng.randint(8, 28)
        # Disparate addresses
        input_addresses = [
            entity_mgr.get_fresh_address(actor.preferred_script_type)
            for _ in range(num_inputs)
        ]
        # In satoshis: 100_000 to 10_000_000 sats per input
        in_sats_list = [rng.randint(100_000, 10_000_000) for _ in range(num_inputs)]
        total_in_sats = sum(in_sats_list)
        fee_sats = rng.randint(15_000, 75_000)
        out_sats = total_in_sats - fee_sats

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
            output_addresses=[target_addr],
            input_amounts=[sats_to_btc(s) for s in in_sats_list],
            output_amounts=[sats_to_btc(out_sats)],
            fee=sats_to_btc(fee_sats),
            script_type=actor.preferred_script_type,
            geo_country=actor.preferred_country,
            asn=actor.preferred_asn,
        )

        label = TransactionLabel(
            txid=txid,
            scenario="fan_in",
            entity_id=entity_id,
            scenario_instance_id=scenario_instance_id,
            is_benign=False,
            parent_txid="",
        )

        transactions.append(tx)
        labels.append(label)

    return transactions, labels
