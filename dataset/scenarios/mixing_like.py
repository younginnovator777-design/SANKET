"""
Scenario 4: Mixing-Like generator.
Creates multi-input/multi-output transactions with several equal or near-equal denomination
outputs resembling CoinJoin / anonymization protocols.
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


def generate_mixing_scenario(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter_start: int,
    instance_id: int,
    max_txs: int = 1,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Generate a mixing-like multi-input multi-output transaction with equal denomination outputs.
    """
    actor = rng.choice(entity_mgr.anomalous_actors)
    entity_id = actor.entity_id
    scenario_instance_id = f"SCN_MIX_{instance_id:06d}"

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    num_txs = min(max_txs, 1)

    for i in range(num_txs):
        clock.tick(rng.uniform(2.0, 15.0))
        txid = generate_txid(seed, tx_counter_start + i)
        event_id = generate_event_id(seed, tx_counter_start + i)
        timestamp = clock.format_timestamp()

        # 4 to 8 participants
        num_participants = rng.randint(4, 8)
        # Denomination: e.g. 0.05, 0.1, 0.25, 0.5, or 1.0 BTC
        equal_denom_btc = rng.choice([0.05, 0.10, 0.25, 0.50, 1.00])
        equal_denom_sats = int(round(equal_denom_btc * 100_000_000))
        fee_per_participant_sats = rng.randint(2_000, 10_000)

        input_addresses: List[str] = []
        input_sats_list: List[int] = []
        output_addresses: List[str] = []
        output_sats_list: List[int] = []

        # Each participant contributes an input covering the denomination + fee + optional change
        for _ in range(num_participants):
            in_addr = entity_mgr.get_fresh_address(actor.preferred_script_type)
            input_addresses.append(in_addr)

            has_change = rng.random() < 0.65
            change_sats = rng.randint(100_000, 5_000_000) if has_change else 0

            in_sats = equal_denom_sats + fee_per_participant_sats + change_sats
            input_sats_list.append(in_sats)

            # Equal denomination output
            out_addr = entity_mgr.get_fresh_address(actor.preferred_script_type)
            output_addresses.append(out_addr)
            output_sats_list.append(equal_denom_sats)

            # Optional change output
            if change_sats > 0:
                change_addr = entity_mgr.get_fresh_address(actor.preferred_script_type)
                output_addresses.append(change_addr)
                output_sats_list.append(change_sats)

        # Shuffle output order so equal denominations and changes are interleaved
        combined = list(zip(output_addresses, output_sats_list))
        rng.shuffle(combined)
        shuffled_addrs, shuffled_sats = zip(*combined)

        total_fee_sats = sum(input_sats_list) - sum(shuffled_sats)
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
            output_addresses=list(shuffled_addrs),
            input_amounts=[sats_to_btc(s) for s in input_sats_list],
            output_amounts=[sats_to_btc(s) for s in shuffled_sats],
            fee=sats_to_btc(total_fee_sats),
            script_type=actor.preferred_script_type,
            geo_country=actor.preferred_country,
            asn=actor.preferred_asn,
        )

        label = TransactionLabel(
            txid=txid,
            scenario="mixing_like",
            entity_id=entity_id,
            scenario_instance_id=scenario_instance_id,
            is_benign=False,
            parent_txid="",
        )

        transactions.append(tx)
        labels.append(label)

    return transactions, labels
