"""
Scenario 3: Peeling-Like chain generator.
Creates a sequence of linked transactions where a large starting value repeatedly peels off
a smaller output while forwarding the remaining large balance to a new change output, which
serves as the input for the next peeling step.
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


def generate_peeling_scenario(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter_start: int,
    instance_id: int,
    max_txs: int = 6,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Generate a peeling chain of linked transactions.
    """
    actor = rng.choice(entity_mgr.anomalous_actors)
    entity_id = actor.entity_id
    scenario_instance_id = f"SCN_PEEL_{instance_id:06d}"

    # Chain length: 3 to 7 hops, capped by max_txs
    chain_length = max(2, min(max_txs, rng.randint(3, 7)))

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    # Large starting balance: 5.0 to 40.0 BTC in satoshis
    current_balance_sats = rng.randint(500_000_000, 4_000_000_000)
    current_input_addr = rng.choice(actor.addresses)
    parent_txid = ""

    for step in range(chain_length):
        # Moderate time delta between peel steps (e.g. 20s to 180s)
        clock.tick(rng.uniform(20.0, 180.0))
        txid = generate_txid(seed, tx_counter_start + step)
        event_id = generate_event_id(seed, tx_counter_start + step)
        timestamp = clock.format_timestamp()

        # Peel off small amount: 0.05 to 0.4 BTC = 5_000_000 to 40_000_000 sats
        peel_sats = rng.randint(5_000_000, min(40_000_000, current_balance_sats // 4))
        fee_sats = rng.randint(5_000, 20_000)
        remaining_sats = current_balance_sats - peel_sats - fee_sats

        peel_addr = entity_mgr.get_fresh_address(actor.preferred_script_type)
        change_addr = entity_mgr.get_fresh_address(actor.preferred_script_type)

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
            input_addresses=[current_input_addr],
            output_addresses=[peel_addr, change_addr],
            input_amounts=[sats_to_btc(current_balance_sats)],
            output_amounts=[sats_to_btc(peel_sats), sats_to_btc(remaining_sats)],
            fee=sats_to_btc(fee_sats),
            script_type=actor.preferred_script_type,
            geo_country=actor.preferred_country,
            asn=actor.preferred_asn,
        )

        label = TransactionLabel(
            txid=txid,
            scenario="peeling_like",
            entity_id=entity_id,
            scenario_instance_id=scenario_instance_id,
            is_benign=False,
            parent_txid=parent_txid,
        )

        transactions.append(tx)
        labels.append(label)

        # Prepare next link in chain
        parent_txid = txid
        current_input_addr = change_addr
        current_balance_sats = remaining_sats

    return transactions, labels
