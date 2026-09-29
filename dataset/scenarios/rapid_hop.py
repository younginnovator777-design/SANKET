"""
Scenario 5: Rapid-Hop chain generator.
Creates chains of transactions where value moves through intermediate addresses
with very short inter-arrival times (e.g. 5 to 45 seconds).
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


def generate_rapid_hop_scenario(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter_start: int,
    instance_id: int,
    max_txs: int = 5,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Generate a rapid-hop chain where value cascades through addresses with minimal delay.
    """
    actor = rng.choice(entity_mgr.anomalous_actors)
    entity_id = actor.entity_id
    scenario_instance_id = f"SCN_RAPID_{instance_id:06d}"

    # Hop chain length: 3 to 6 hops, capped by max_txs
    chain_length = max(2, min(max_txs, rng.randint(3, 6)))

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    # Initial transferred balance: 0.5 to 15.0 BTC in satoshis
    current_sats = rng.randint(50_000_000, 1_500_000_000)
    current_addr = rng.choice(actor.addresses)
    parent_txid = ""

    for step in range(chain_length):
        # Short inter-arrival: 5 to 45 seconds
        clock.tick(rng.uniform(5.0, 45.0))
        txid = generate_txid(seed, tx_counter_start + step)
        event_id = generate_event_id(seed, tx_counter_start + step)
        timestamp = clock.format_timestamp()

        fee_sats = rng.randint(3_000, 15_000)
        out_sats = current_sats - fee_sats
        next_addr = entity_mgr.get_fresh_address(actor.preferred_script_type)

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
            input_addresses=[current_addr],
            output_addresses=[next_addr],
            input_amounts=[sats_to_btc(current_sats)],
            output_amounts=[sats_to_btc(out_sats)],
            fee=sats_to_btc(fee_sats),
            script_type=actor.preferred_script_type,
            geo_country=actor.preferred_country,
            asn=actor.preferred_asn,
        )

        label = TransactionLabel(
            txid=txid,
            scenario="rapid_hop",
            entity_id=entity_id,
            scenario_instance_id=scenario_instance_id,
            is_benign=False,
            parent_txid=parent_txid,
        )

        transactions.append(tx)
        labels.append(label)

        parent_txid = txid
        current_addr = next_addr
        current_sats = out_sats

    return transactions, labels
