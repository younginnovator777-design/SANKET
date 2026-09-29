"""
Scenario 6: Network-Cluster observational anomaly generator.
Creates multiple transactions involving completely distinct addresses but sharing
tight network observational telemetry (same src IP, repeated endpoint, repeated ASN,
and correlated port ranges).
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


def generate_network_cluster_scenario(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter_start: int,
    instance_id: int,
    max_txs: int = 6,
) -> Tuple[List[GeneratedTransaction], List[TransactionLabel]]:
    """
    Generate a cluster of transactions from an identical network vantage point
    with unlinked Bitcoin addresses.
    """
    actor = rng.choice(entity_mgr.anomalous_actors)
    entity_id = actor.entity_id
    scenario_instance_id = f"SCN_NET_{instance_id:06d}"

    cluster_size = max(2, min(max_txs, rng.randint(3, 6)))

    transactions: List[GeneratedTransaction] = []
    labels: List[TransactionLabel] = []

    # Network vantage point fixed across all transactions in cluster
    shared_src_ip = actor.preferred_ip
    shared_asn = actor.preferred_asn
    shared_country = actor.preferred_country
    dst_ip, dst_port = entity_mgr.get_destination_peer()
    base_src_port = rng.randint(30000, 60000)

    for i in range(cluster_size):
        clock.tick(rng.uniform(1.0, 8.0))
        txid = generate_txid(seed, tx_counter_start + i)
        event_id = generate_event_id(seed, tx_counter_start + i)
        timestamp = clock.format_timestamp()

        # Ephemeral ports correlate sequentially or tightly
        src_port = base_src_port + i

        # Unrelated fresh addresses for each transaction
        script_type = actor.preferred_script_type
        in_addr = entity_mgr.get_fresh_address(script_type)
        out_addr = entity_mgr.get_fresh_address(script_type)

        payment_sats = rng.randint(200_000, 15_000_000)
        fee_sats = rng.randint(2_500, 12_000)
        input_sats = payment_sats + fee_sats

        tx = GeneratedTransaction(
            event_id=event_id,
            txid=txid,
            timestamp=timestamp,
            src_ip=shared_src_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            input_addresses=[in_addr],
            output_addresses=[out_addr],
            input_amounts=[sats_to_btc(input_sats)],
            output_amounts=[sats_to_btc(payment_sats)],
            fee=sats_to_btc(fee_sats),
            script_type=script_type,
            geo_country=shared_country,
            asn=shared_asn,
        )

        label = TransactionLabel(
            txid=txid,
            scenario="network_cluster",
            entity_id=entity_id,
            scenario_instance_id=scenario_instance_id,
            is_benign=False,
            parent_txid="",
        )

        transactions.append(tx)
        labels.append(label)

    return transactions, labels
