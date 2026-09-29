"""
Benign Bitcoin transaction generator for SANKET.
Models legitimate real-world patterns: ordinary consumer payments, merchant checkouts,
and critical benign confounders (exchange batch payouts, merchant sweeps, mining payouts,
recurring services, and high-volume payment processors).
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
    btc_to_sats,
)


def generate_benign_transaction(
    rng: random.Random,
    entity_mgr: EntityManager,
    clock: SimulationClock,
    seed: int,
    tx_counter: int,
    subtype: str = "ordinary_user",
) -> Tuple[GeneratedTransaction, TransactionLabel]:
    """Generate a single benign transaction of the specified subtype."""
    clock.tick()
    txid = generate_txid(seed, tx_counter)
    event_id = generate_event_id(seed, tx_counter)
    timestamp = clock.format_timestamp()
    dst_ip, dst_port = entity_mgr.get_destination_peer()
    src_port = entity_mgr.get_ephemeral_port()

    if subtype == "ordinary_user":
        # 1-2 inputs, 1-2 outputs (recipient + change)
        user = rng.choice(entity_mgr.users)
        entity_id = user.entity_id
        src_ip = user.preferred_ip
        asn = user.preferred_asn
        geo_country = user.preferred_country
        script_type = user.preferred_script_type

        # Amount: 0.0005 to 0.35 BTC
        payment_sats = rng.randint(50_000, 35_000_000)
        fee_sats = rng.randint(1_000, 15_000)
        change_sats = rng.randint(10_000, 20_000_000) if rng.random() < 0.85 else 0

        input_sats = payment_sats + change_sats + fee_sats
        input_addresses = [rng.choice(user.addresses)]
        recipient = rng.choice(entity_mgr.users)
        output_addresses = [rng.choice(recipient.addresses)]
        output_amounts_sats = [payment_sats]

        if change_sats > 0:
            change_addr = entity_mgr.get_fresh_address(script_type)
            output_addresses.append(change_addr)
            output_amounts_sats.append(change_sats)

        input_amounts = [sats_to_btc(input_sats)]
        output_amounts = [sats_to_btc(s) for s in output_amounts_sats]
        fee = sats_to_btc(fee_sats)

    elif subtype == "merchant_payment":
        # Customer pays a merchant
        user = rng.choice(entity_mgr.users)
        merchant = rng.choice(entity_mgr.merchants)
        entity_id = user.entity_id
        src_ip = user.preferred_ip
        asn = user.preferred_asn
        geo_country = user.preferred_country
        script_type = user.preferred_script_type

        # Amount: 0.005 to 1.5 BTC
        payment_sats = rng.randint(500_000, 150_000_000)
        fee_sats = rng.randint(2_000, 25_000)
        change_sats = rng.randint(50_000, 50_000_000)

        input_sats = payment_sats + change_sats + fee_sats
        input_addresses = [rng.choice(user.addresses)]
        output_addresses = [rng.choice(merchant.addresses), entity_mgr.get_fresh_address(script_type)]
        output_amounts_sats = [payment_sats, change_sats]

        input_amounts = [sats_to_btc(input_sats)]
        output_amounts = [sats_to_btc(s) for s in output_amounts_sats]
        fee = sats_to_btc(fee_sats)

    elif subtype == "merchant_consolidation":
        # Confounder for fan-in: merchant sweeps multiple incoming payment UTXOs
        merchant = rng.choice(entity_mgr.merchants)
        entity_id = merchant.entity_id
        src_ip = merchant.preferred_ip
        asn = merchant.preferred_asn
        geo_country = merchant.preferred_country
        script_type = merchant.preferred_script_type

        num_inputs = rng.randint(6, 16)
        input_addrs = rng.sample(merchant.addresses, min(num_inputs, len(merchant.addresses)))
        while len(input_addrs) < num_inputs:
            input_addrs.append(entity_mgr.get_fresh_address(script_type))

        in_sats_list = [rng.randint(200_000, 5_000_000) for _ in range(num_inputs)]
        total_in_sats = sum(in_sats_list)
        fee_sats = rng.randint(15_000, 60_000)
        out_sats = total_in_sats - fee_sats

        dest_addr = rng.choice(merchant.addresses)
        input_addresses = input_addrs
        output_addresses = [dest_addr]
        input_amounts = [sats_to_btc(s) for s in in_sats_list]
        output_amounts = [sats_to_btc(out_sats)]
        fee = sats_to_btc(fee_sats)

    elif subtype == "exchange_batch":
        # Confounder for fan-out: exchange batch payout to customers
        exchange = rng.choice(entity_mgr.exchanges)
        entity_id = exchange.entity_id
        src_ip = exchange.preferred_ip
        asn = exchange.preferred_asn
        geo_country = exchange.preferred_country
        script_type = exchange.preferred_script_type

        num_outputs = rng.randint(8, 25)
        # Select customer recipient addresses
        output_addrs = [
            rng.choice(rng.choice(entity_mgr.users).addresses)
            for _ in range(num_outputs)
        ]
        out_sats_list = [rng.randint(100_000, 20_000_000) for _ in range(num_outputs)]
        fee_sats = rng.randint(20_000, 100_000)

        # 1-3 inputs from exchange hot wallets
        num_inputs = rng.randint(1, 3)
        total_out_sats = sum(out_sats_list) + fee_sats
        per_input_sats = total_out_sats // num_inputs
        in_sats_list = [per_input_sats] * num_inputs
        in_sats_list[-1] += total_out_sats - sum(in_sats_list)

        input_addrs = rng.sample(exchange.addresses, min(num_inputs, len(exchange.addresses)))
        while len(input_addrs) < num_inputs:
            input_addrs.append(entity_mgr.get_fresh_address(script_type))

        input_addresses = input_addrs
        output_addresses = output_addrs
        input_amounts = [sats_to_btc(s) for s in in_sats_list]
        output_amounts = [sats_to_btc(s) for s in out_sats_list]
        fee = sats_to_btc(fee_sats)

    elif subtype == "mining_pool":
        # Confounder for fan-out: mining pool block reward / share distribution
        miner = rng.choice(entity_mgr.miners)
        entity_id = miner.entity_id
        src_ip = miner.preferred_ip
        asn = miner.preferred_asn
        geo_country = miner.preferred_country
        script_type = miner.preferred_script_type

        num_outputs = rng.randint(6, 18)
        output_addrs = [
            rng.choice(rng.choice(entity_mgr.users).addresses)
            for _ in range(num_outputs)
        ]
        out_sats_list = [rng.randint(50_000, 3_000_000) for _ in range(num_outputs)]
        fee_sats = rng.randint(5_000, 25_000)
        total_in_sats = sum(out_sats_list) + fee_sats

        input_addresses = [rng.choice(miner.addresses)]
        output_addresses = output_addrs
        input_amounts = [sats_to_btc(total_in_sats)]
        output_amounts = [sats_to_btc(s) for s in out_sats_list]
        fee = sats_to_btc(fee_sats)

    elif subtype == "service_recurring":
        # Automated recurring service payment (fixed schedule confounder)
        service = rng.choice(entity_mgr.services)
        entity_id = service.entity_id
        src_ip = service.preferred_ip
        asn = service.preferred_asn
        geo_country = service.preferred_country
        script_type = service.preferred_script_type

        payment_sats = rng.randint(100_000, 5_000_000)
        fee_sats = rng.randint(2_000, 10_000)
        input_sats = payment_sats + fee_sats

        input_addresses = [rng.choice(service.addresses)]
        output_addresses = [rng.choice(rng.choice(entity_mgr.users).addresses)]
        input_amounts = [sats_to_btc(input_sats)]
        output_amounts = [sats_to_btc(payment_sats)]
        fee = sats_to_btc(fee_sats)

    else:  # "high_volume_processor"
        # High volume legitimate payment processor (confounder for network cluster)
        cnf = rng.choice(entity_mgr.confounders)
        entity_id = cnf.entity_id
        src_ip = cnf.preferred_ip
        asn = cnf.preferred_asn
        geo_country = cnf.preferred_country
        script_type = cnf.preferred_script_type

        payment_sats = rng.randint(200_000, 10_000_000)
        fee_sats = rng.randint(3_000, 15_000)
        change_sats = rng.randint(50_000, 5_000_000)
        input_sats = payment_sats + change_sats + fee_sats

        input_addresses = [rng.choice(cnf.addresses)]
        output_addresses = [
            rng.choice(rng.choice(entity_mgr.merchants).addresses),
            entity_mgr.get_fresh_address(script_type),
        ]
        output_amounts_sats = [payment_sats, change_sats]

        input_amounts = [sats_to_btc(input_sats)]
        output_amounts = [sats_to_btc(s) for s in output_amounts_sats]
        fee = sats_to_btc(fee_sats)

    # Sanity invariant check
    assert sum(input_amounts) >= sum(output_amounts) + fee - 1e-7

    tx = GeneratedTransaction(
        event_id=event_id,
        txid=txid,
        timestamp=timestamp,
        src_ip=src_ip,
        dst_ip=dst_ip,
        src_port=src_port,
        dst_port=dst_port,
        input_addresses=input_addresses,
        output_addresses=output_addresses,
        input_amounts=input_amounts,
        output_amounts=output_amounts,
        fee=fee,
        script_type=script_type,
        geo_country=geo_country,
        asn=asn,
    )

    label = TransactionLabel(
        txid=txid,
        scenario="benign",
        entity_id=entity_id,
        scenario_instance_id=f"SCN_BENIGN_{subtype}",
        is_benign=True,
        parent_txid="",
    )

    return tx, label
